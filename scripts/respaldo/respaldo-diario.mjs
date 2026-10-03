#!/usr/bin/env node
/**
 * Respaldo diario de la base de producción (incidente 02-oct-2026).
 *
 * Por qué existe: el proyecto está en el plan FREE de Supabase, que no tiene NINGÚN backup ni PITR.
 * Si se corrompe o se borra algo, sin esto no hay vuelta atrás.
 *
 * Cómo: exporta cada tabla (todas las de `public` + las cuentas de `auth`, ver tablas-auth.mjs) como JSON vía la Management API
 * (no necesita la clave directa de Postgres) y lo guarda comprimido en una carpeta de OneDrive FUERA del repo
 * (el repo es público: un respaldo ahí expondría datos de usuarios; el script se niega a escribir dentro de
 * un repo git). OneDrive lo sube a la nube: copia fuera de Supabase y fuera del PC.
 *   - Verificación: cada tabla se exporta con su count(*) en la misma consulta (misma snapshot).
 *   - Secretos que no hacen falta para reconstruir cuentas (tokens de confirmación/recuperación, secreto TOTP)
 *     no se exportan.
 *   - Retención: borra respaldos de más de RETENCION_DIAS, pero SOLO si el de hoy salió completo y solo
 *     carpetas que son respaldos (tienen _manifiesto.json).
 *   - Si algo falla: aviso por Telegram (no queda solo en un log que nadie lee).
 *   - Pausa entre tablas: la primera corrida sin pausa degradó la base free (~0,5 GB).
 * El esquema no se respalda acá: vive en `supabase/migrations/`. Restaurar: scripts/respaldo/restaurar.mjs
 * (manual en docs/claude/respaldos.md).
 *
 * Uso:  node --env-file=.env.local scripts/respaldo/respaldo-diario.mjs [--destino <carpeta>]
 */
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { gzipSync } from 'node:zlib'
import { projectRefDe } from '../lib/supabase-ref.mjs'
import { sendNew } from '../ceo/telegram.mjs'
import { AUTH_TABLAS } from './tablas-auth.mjs'

const RETENCION_DIAS = 30
const PAUSA_MS = 2_000
const argv = process.argv.slice(2)
const iDest = argv.indexOf('--destino')
if (iDest >= 0 && (!argv[iDest + 1] || argv[iDest + 1].startsWith('--'))) { console.error('--destino requiere una carpeta.'); process.exit(1) }
const RAIZ = resolve(iDest >= 0 ? argv[iDest + 1] : join(homedir(), 'OneDrive', 'GolfersPlus-Respaldos'))
const REF = projectRefDe(process.env.NEXT_PUBLIC_SUPABASE_URL)
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

function dentroDeUnRepo(dir) {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return d
    if (dirname(d) === d) return null
  }
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120_000),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`)
  return JSON.parse(t)
}

const ident = t => t.split('.').map(p => `"${p.replace(/"/g, '""')}"`).join('.')
const lit = s => `'${String(s).replace(/'/g, "''")}'`

async function respaldar() {
  if (!REF || !TOKEN) throw new Error('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_ACCESS_TOKEN (.env.local)')
  const repo = dentroDeUnRepo(RAIZ)
  if (repo) throw new Error(`el destino ${RAIZ} está dentro del repo ${repo}: un respaldo ahí puede terminar commiteado`)
  const dia = new Date().toISOString().slice(0, 10)
  const carpeta = join(RAIZ, dia)
  mkdirSync(carpeta, { recursive: true })

  const publicas = (await sql(
    "select table_schema||'.'||table_name t from information_schema.tables where table_type='BASE TABLE' and table_schema='public' order by 1",
  )).map(x => x.t)
  const tablas = [...publicas.map(t => [t, []]), ...Object.entries(AUTH_TABLAS).map(([t, v]) => [t, v.sinColumnas])]
  const migraciones = (await sql('select version, name from supabase_migrations.schema_migrations order by version')).map(m => `${m.version} ${m.name}`)

  const manifiesto = { fecha: new Date().toISOString(), proyecto: REF, completo: false, migraciones, tablas: {}, errores: [] }
  let bytes = 0
  for (const [t, sinColumnas] of tablas) {
    try {
      const quitar = sinColumnas.map(c => ` - ${lit(c)}`).join('')
      // Filas y conteo en la MISMA consulta (misma snapshot): la verificación no depende de escrituras concurrentes.
      const [{ filas, n }] = await sql(`select coalesce(json_agg(to_jsonb(x)${quitar}), '[]'::json) filas, count(*)::int n from ${ident(t)} x`)
      if (!Array.isArray(filas) || filas.length !== n) throw new Error(`verificación: exportó ${filas?.length} de ${n} filas`)
      const gz = gzipSync(JSON.stringify(filas))
      writeFileSync(join(carpeta, `${t}.json.gz`), gz)
      manifiesto.tablas[t] = { filas: n, bytes: gz.length }
      bytes += gz.length
    } catch (e) {
      manifiesto.errores.push(`${t}: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, PAUSA_MS))
  }
  manifiesto.completo = manifiesto.errores.length === 0
  writeFileSync(join(carpeta, '_manifiesto.json'), JSON.stringify(manifiesto, null, 2))

  // Retención: solo con un respaldo completo hoy, y solo carpetas que son respaldos (tienen _manifiesto.json).
  if (manifiesto.completo) {
    const limite = Date.now() - RETENCION_DIAS * 864e5
    for (const d of readdirSync(RAIZ)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d === dia) continue
      if (Date.parse(`${d}T00:00:00Z`) < limite && existsSync(join(RAIZ, d, '_manifiesto.json'))) rmSync(join(RAIZ, d), { recursive: true, force: true })
    }
  }

  const filas = Object.values(manifiesto.tablas).reduce((a, b) => a + b.filas, 0)
  console.log(`${new Date().toISOString()} Respaldo ${dia}: ${Object.keys(manifiesto.tablas).length}/${tablas.length} tablas · ${filas.toLocaleString('es-CL')} filas · ${(bytes / 1e6).toFixed(1)} MB → ${carpeta}`)
  if (!manifiesto.completo) throw new Error(`respaldo INCOMPLETO (${manifiesto.errores.length} tablas):\n- ${manifiesto.errores.join('\n- ')}`)
}

try {
  await respaldar()
} catch (e) {
  console.error(`${new Date().toISOString()} ERROR respaldo: ${e.message}`)
  await sendNew(`⚠️ Golfers+: el respaldo diario de la base falló.\n${e.message.slice(0, 800)}\nManual: docs/claude/respaldos.md`, m => console.log(m))
  process.exitCode = 1
}
