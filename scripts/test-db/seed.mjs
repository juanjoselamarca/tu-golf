#!/usr/bin/env node
/**
 * Llena la base de pruebas (`golfersplus-test`) con lo mínimo que piden los tests: el catálogo de canchas
 * completo y las filas fijas que leen los tests (torneos gate-scorer-*, ronda demo GATEB2BN…). Qué se copia y
 * por qué: scripts/test-db/seed-manifest.json. Correr DESPUÉS de sync-schema.mjs.
 *
 * Reglas:
 *   - De prod sólo se LEE, de a una tabla y con pausa (prod es Supabase Free/Nano).
 *   - Ningún dato personal de usuarios reales: las cuentas de la base de pruebas se crean acá con
 *     auth.admin.createUser (nunca se copia `auth` de prod), toda columna que apunta a una persona se reescribe
 *     (manifiesto → `usuarios`) y el seed ABORTA antes de escribir si una fila trae el id de un usuario real.
 *   - Las cuentas de la base de pruebas son todas @golfersplus-test.local: se borran y se recrean en cada corrida
 *     (sync-schema vacía `profiles`; recrearlas hace que el trigger on_auth_user_created arme el perfil de nuevo).
 *     Si aparece una cuenta con otro dominio, el seed aborta en vez de borrarla.
 *   - Idempotente: upsert por llave primaria.
 *
 * Uso:  node --env-file=.env.local scripts/test-db/seed.mjs
 * Env:  NEXT_PUBLIC_SUPABASE_URL (prod, lectura) · TEST_SUPABASE_URL · TEST_SUPABASE_SERVICE_ROLE_KEY ·
 *       TEST_E2E_USER_PASSWORD (contraseña del usuario E2E de la base de pruebas) · SUPABASE_ACCESS_TOKEN
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { sqlEn, lit, qi } from '../lib/management-sql.mjs'
import { resolverProyectos } from './proyectos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const DOMINIO_PRUEBAS = '@golfersplus-test.local'
const PAUSA_MS = 1_000
const LOTE_BYTES = 600_000 // la Management API rechaza cuerpos grandes (413): mismo margen que respaldo/restaurar.mjs
const dormir = ms => new Promise(r => setTimeout(r, ms))

const manifiesto = JSON.parse(readFileSync(join(AQUI, 'seed-manifest.json'), 'utf8'))

async function leerTabla(prod, tabla, donde) {
  const [{ filas, n }] = await sqlEn(prod,
    `select coalesce(json_agg(to_jsonb(x)), '[]'::json) filas, count(*)::int n from public.${qi(tabla)} x${donde ? ` where ${donde}` : ''}`)
  if (!Array.isArray(filas) || filas.length !== n) throw new Error(`${tabla}: se leyeron ${filas?.length} de ${n} filas`)
  return filas
}

/** Columnas escribibles (no generadas), llave primaria, identity y FK a sí misma de una tabla en la base de pruebas. */
async function estructura(pruebas, tabla) {
  const columnas = await sqlEn(pruebas, `select column_name c, is_generated g, identity_generation i from information_schema.columns
    where table_schema='public' and table_name=${lit(tabla)} order by ordinal_position`)
  if (!columnas.length) throw new Error(`public.${tabla} no existe en la base de pruebas (¿falta correr sync-schema.mjs?)`)
  const pk = (await sqlEn(pruebas, `select a.attname c from pg_index x join pg_attribute a on a.attrelid=x.indrelid and a.attnum=any(x.indkey)
    where x.indrelid=${lit(`public.${tabla}`)}::regclass and x.indisprimary`)).map(r => r.c)
  if (!pk.length) throw new Error(`public.${tabla} no tiene llave primaria: no se puede sembrar idempotente`)
  const selfFk = (await sqlEn(pruebas, `select count(*)::int n from pg_constraint where contype='f' and conrelid=confrelid
    and conrelid=${lit(`public.${tabla}`)}::regclass`))[0].n > 0
  return { columnas, pk, selfFk }
}

async function upsert(pruebas, tabla, filas) {
  if (!filas.length) return 0
  const { columnas, pk, selfFk } = await estructura(pruebas, tabla)
  const cols = columnas.filter(c => c.g !== 'ALWAYS').map(c => c.c)
  const identity = columnas.some(c => c.i === 'ALWAYS')
  const lotes = []
  for (let i = 0, actual = [], tam = 0; i <= filas.length; i++) {
    const f = filas[i]
    const t = f ? Buffer.byteLength(JSON.stringify(f)) : 0
    if (actual.length && (!f || tam + t > LOTE_BYTES)) { lotes.push(actual); actual = []; tam = 0 }
    if (f) { actual.push(f); tam += t }
  }
  // Una FK a la misma tabla (courses.parent_id) se valida al final de CADA sentencia: en un solo lote da igual el
  // orden; repartida en varios, un hijo podría llegar antes que su padre. Hoy courses cabe holgado en un lote.
  if (selfFk && lotes.length > 1) throw new Error(`${tabla}: tiene FK a sí misma y no cabe en un lote (${lotes.length}); ordenar por FK como restaurar.mjs`)
  const lista = cols.map(qi).join(', ')
  const actualizar = cols.filter(c => !pk.includes(c)).map(c => `${qi(c)} = excluded.${qi(c)}`).join(', ')
  for (const lote of lotes) {
    await sqlEn(pruebas, `insert into public.${qi(tabla)} (${lista})${identity ? ' overriding system value' : ''}
      select ${cols.map(c => `r.${qi(c)}`).join(', ')} from json_populate_recordset(null::public.${qi(tabla)}, ${lit(JSON.stringify(lote))}::json) r
      on conflict (${pk.map(qi).join(', ')}) do ${actualizar ? `update set ${actualizar}` : 'nothing'}`)
  }
  // Secuencias (serial/identity) al máximo sembrado: los inserts de los tests no chocan con ids copiados.
  await sqlEn(pruebas, `select setval(s.seq, greatest((select coalesce(max(v), 0) from (select (to_jsonb(t)->>s.col)::bigint v from public.${qi(tabla)} t) m), 1))
    from (select a.attname col, pg_get_serial_sequence(${lit(`public.${tabla}`)}, a.attname) seq from pg_attribute a
      where a.attrelid=${lit(`public.${tabla}`)}::regclass and a.attnum>0 and not a.attisdropped) s where s.seq is not null`)
  return filas.length
}

/** Cuentas de la base de pruebas: todas sintéticas. Borra las del dominio de pruebas; aborta si hay otras. */
async function limpiarCuentas(pruebas) {
  const ajenas = await sqlEn(pruebas, `select count(*)::int n from auth.users where email is null or email not like ${lit(`%${DOMINIO_PRUEBAS}`)}`)
  if (ajenas[0].n) throw new Error(`la base de pruebas tiene ${ajenas[0].n} cuenta(s) fuera de ${DOMINIO_PRUEBAS}: revisar a mano (el seed no borra cuentas que no creó)`)
  const [{ n }] = await sqlEn(pruebas, `with b as (delete from auth.users where email like ${lit(`%${DOMINIO_PRUEBAS}`)} returning 1) select count(*)::int n from b`)
  return n
}

async function crearCuenta(admin, email, nombre, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: password ?? `Seed-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { name: nombre, seed: true },
  })
  if (error || !data.user) throw new Error(`no se pudo crear ${email}: ${error?.message}`)
  return data.user.id
}

async function main() {
  const { prod, pruebas } = await resolverProyectos()
  const url = process.env.TEST_SUPABASE_URL
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  const e2ePassword = process.env.TEST_E2E_USER_PASSWORD
  if (!key) throw new Error('falta TEST_SUPABASE_SERVICE_ROLE_KEY')
  if (!e2ePassword) throw new Error('falta TEST_E2E_USER_PASSWORD (contraseña del usuario E2E en la base de pruebas)')
  console.log(`origen (prod, sólo lectura): ${prod} · destino (pruebas): ${pruebas}`)

  // 1) Leer TODO de prod antes de escribir nada (si la lectura falla a mitad, la base de pruebas no queda a medias).
  const idsReales = new Set((await sqlEn(prod, 'select id::text id from auth.users')).map(r => r.id))
  const lecturas = []
  for (const tabla of manifiesto.catalogo) {
    lecturas.push({ tabla, filas: await leerTabla(prod, tabla) })
    await dormir(PAUSA_MS)
  }
  for (const fx of manifiesto.fixtures) {
    lecturas.push({ tabla: fx.tabla, filas: await leerTabla(prod, fx.tabla, fx.donde), usuarios: fx.usuarios ?? {} })
    await dormir(PAUSA_MS)
  }

  // 2) Cuentas sintéticas.
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const borradas = await limpiarCuentas(pruebas)
  const cuentas = {}
  for (const [rol, u] of Object.entries(manifiesto.usuarios)) cuentas[rol] = await crearCuenta(admin, u.email, u.nombre)
  console.log(`cuentas: ${borradas} sintéticas borradas; creadas ${Object.keys(cuentas).join(', ')}`)

  // 3) Reescribir columnas de personas y verificar que no queda NINGÚN id de usuario real de prod.
  for (const l of lecturas) {
    for (const f of l.filas) {
      for (const [col, destino] of Object.entries(l.usuarios ?? {})) {
        if (!(col in f)) throw new Error(`${l.tabla}.${col} no existe en prod: actualizar seed-manifest.json`)
        if (f[col] != null) f[col] = destino === 'null' ? null : cuentas[destino] ?? (() => { throw new Error(`usuario "${destino}" no está en el manifiesto`) })()
      }
      const texto = JSON.stringify(f)
      for (const m of texto.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) {
        if (idsReales.has(m[0].toLowerCase())) throw new Error(`${l.tabla}: una fila trae el id de un usuario real (${m[0].slice(0, 8)}…). Agregar la columna a "usuarios" en seed-manifest.json`)
      }
    }
  }

  // 4) Escribir en orden (catálogo → fixtures, cada tabla después de las que referencia).
  const resumen = []
  for (const l of lecturas) {
    resumen.push(`${l.tabla} ${await upsert(pruebas, l.tabla, l.filas)}`)
  }
  console.log(`sembrado: ${resumen.join(' · ')}`)

  // 5) Usuario E2E con el script de siempre, apuntado a la base de pruebas (crea también su torneo semilla).
  const r = spawnSync(process.execPath, [join(RAIZ, 'scripts', 'setup-e2e-user.mjs')], {
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, E2E_SETUP_PASSWORD: e2ePassword },
    encoding: 'utf8',
  })
  process.stdout.write(r.stdout ?? '')
  if (r.status !== 0) throw new Error(`setup-e2e-user.mjs falló (exit ${r.status}): ${(r.stderr ?? '').slice(0, 500)}`)

  await sqlEn(pruebas, `notify pgrst, 'reload schema'`)
  console.log('✔ seed de la base de pruebas completo')
}

main().catch(e => { console.error(`✘ seed: ${e.message}`); process.exitCode = 1 })
