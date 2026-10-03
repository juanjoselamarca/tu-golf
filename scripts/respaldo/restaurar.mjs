#!/usr/bin/env node
/**
 * Restaura una tabla desde el respaldo diario (scripts/respaldo/respaldo-diario.mjs).
 *
 * Por defecto NO escribe en producción: carga el respaldo en una tabla temporal con la misma estructura y
 * cuenta las filas, para probar que el respaldo entra (tipos, columnas generadas, identity). Solo con
 * `--aplicar` inserta en la tabla real — eso es escritura masiva sobre datos de usuarios (zona crítica):
 * antes, `revisor-fable` revisa el SQL que este script imprime con `--mostrar-sql`.
 *
 * Detalles que el SQL ingenuo (`insert … select * from json_populate_recordset`) no resuelve:
 *   - columnas GENERATED ALWAYS (courses.nombre_canonico, knowledge_chunks.tsv, auth.users.confirmed_at…):
 *     se excluyen de la lista de columnas; Postgres las recalcula.
 *   - columnas IDENTITY ALWAYS (pattern_observations.id, external_priors_*.id): OVERRIDING SYSTEM VALUE.
 *   - el usuario de la Management API no es superuser: no se pueden apagar triggers. Restaurar auth.users
 *     dispara on_auth_user_created, que crea un `profiles` vacío; por eso `profiles` se restaura con
 *     --modo actualizar (ON CONFLICT DO UPDATE), que pisa ese stub con el dato del respaldo.
 *
 * Uso:
 *   node --env-file=.env.local scripts/respaldo/restaurar.mjs --tabla public.courses [--fecha AAAA-MM-DD]
 *        [--modo faltantes|actualizar] [--aplicar] [--mostrar-sql] [--origen <carpeta de respaldos>]
 *   faltantes (default): inserta solo las filas cuyo id no existe. actualizar: además pisa las existentes.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { gunzipSync } from 'node:zlib'
import { projectRefDe } from '../lib/supabase-ref.mjs'

const argv = process.argv.slice(2)
const arg = k => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined }
const flag = k => argv.includes(`--${k}`)
const tabla = arg('tabla')
const modo = arg('modo') ?? 'faltantes'
const ORIGEN = arg('origen') ?? join(homedir(), 'OneDrive', 'GolfersPlus-Respaldos')
const REF = projectRefDe(process.env.NEXT_PUBLIC_SUPABASE_URL)
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!tabla || !/^(public|auth)\.[a-z_][a-z0-9_]*$/.test(tabla)) { console.error('Falta --tabla esquema.tabla (public.* o auth.*).'); process.exit(1) }
if (!['faltantes', 'actualizar'].includes(modo)) { console.error('--modo debe ser faltantes o actualizar.'); process.exit(1) }
if (!REF || !TOKEN) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN (.env.local).'); process.exit(1) }

const fechas = existsSync(ORIGEN) ? readdirSync(ORIGEN).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(ORIGEN, d, '_manifiesto.json'))).sort() : []
const fecha = arg('fecha') ?? fechas.at(-1)
if (!fecha || !fechas.includes(fecha)) { console.error(`No hay respaldo completo para ${fecha ?? '(ninguna fecha)'} en ${ORIGEN}. Disponibles: ${fechas.join(', ') || 'ninguno'}`); process.exit(1) }
const archivo = join(ORIGEN, fecha, `${tabla}.json.gz`)
if (!existsSync(archivo)) { console.error(`El respaldo ${fecha} no tiene ${tabla}.`); process.exit(1) }
const filas = JSON.parse(gunzipSync(readFileSync(archivo)))

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(180_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 500)}`)
  return JSON.parse(t)
}

const [esq, nom] = tabla.split('.')
const lit = s => `'${String(s).replace(/'/g, "''")}'`
const qi = s => `"${String(s).replace(/"/g, '""')}"`
const columnas = await sql(`select column_name c, is_generated g, identity_generation i from information_schema.columns
  where table_schema=${lit(esq)} and table_name=${lit(nom)} order by ordinal_position`)
if (!columnas.length) { console.error(`${tabla} no existe en la base.`); process.exit(1) }
const pk = (await sql(`select a.attname c from pg_index x join pg_attribute a on a.attrelid=x.indrelid and a.attnum=any(x.indkey)
  where x.indrelid=${lit(tabla)}::regclass and x.indisprimary`)).map(r => r.c)
if (!pk.length) { console.error(`${tabla} no tiene llave primaria: restaurar a mano.`); process.exit(1) }

const cols = columnas.filter(c => c.g !== 'ALWAYS').map(c => c.c)
const identity = columnas.some(c => c.i === 'ALWAYS')
const lista = cols.map(qi).join(', ')
const conflicto = modo === 'actualizar'
  ? `on conflict (${pk.map(qi).join(', ')}) do update set ${cols.filter(c => !pk.includes(c)).map(c => `${qi(c)} = excluded.${qi(c)}`).join(', ')}`
  : `on conflict (${pk.map(qi).join(', ')}) do nothing`
const fuente = `json_populate_recordset(null::${qi(esq)}.${qi(nom)}, ${lit(JSON.stringify(filas))}::json)`
const insertar = destino => `insert into ${destino} (${lista})${identity ? ' overriding system value' : ''}
  select ${lista} from ${fuente} ${conflicto}`

if (flag('mostrar-sql')) console.log(insertar(`${qi(esq)}.${qi(nom)}`).replace(fuente, `json_populate_recordset(null::${qi(esq)}.${qi(nom)}, '<${filas.length} filas del respaldo ${fecha}>'::json)`))

if (!flag('aplicar')) {
  // Prueba: misma estructura (incluye generadas, identity, PK), sin datos, sin triggers ni FKs. Se borra al final.
  const tmp = `restaurar_prueba_${Date.now()}`
  const [{ n }] = await sql(`create table public.${tmp} (like ${qi(esq)}.${qi(nom)} including all);
    ${insertar(`public.${tmp}`)};
    select count(*)::int n from public.${tmp}`).finally(() => sql(`drop table if exists public.${tmp}`))
  const ok = n === filas.length
  console.log(`${ok ? '✔' : '✘'} PRUEBA ${tabla} (respaldo ${fecha}): ${n}/${filas.length} filas entran con tipos, columnas generadas e identity. Nada se escribió en la tabla real.`)
  process.exit(ok ? 0 : 1)
}

const antes = (await sql(`select count(*)::int n from ${qi(esq)}.${qi(nom)}`))[0].n
await sql(insertar(`${qi(esq)}.${qi(nom)}`))
const despues = (await sql(`select count(*)::int n from ${qi(esq)}.${qi(nom)}`))[0].n
console.log(`APLICADO ${tabla} (${modo}, respaldo ${fecha}): ${antes} → ${despues} filas (+${despues - antes}).`)
