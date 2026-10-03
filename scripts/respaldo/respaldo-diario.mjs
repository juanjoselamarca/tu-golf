#!/usr/bin/env node
/**
 * Respaldo diario de la base de producción (incidente 02-oct-2026).
 *
 * Por qué existe: el proyecto está en el plan FREE de Supabase, que no tiene NINGÚN backup ni PITR.
 * Si se corrompe o se borra algo, sin esto no hay vuelta atrás.
 *
 * Cómo: exporta cada tabla (todas las de `public` + los datos de cuentas de `auth`) como JSON vía la
 * Management API (no necesita la clave directa de Postgres) y lo guarda comprimido en una carpeta de
 * OneDrive FUERA del repo (el repo es público: un respaldo ahí expondría datos de usuarios). OneDrive
 * lo sube a la nube: queda copia fuera de Supabase y fuera del PC. Verifica cada tabla contando filas
 * y conserva `RETENCION_DIAS`. El esquema no se respalda acá: vive en `supabase/migrations/`.
 *
 * Uso:  node --env-file=.env.local scripts/respaldo/respaldo-diario.mjs [--destino <carpeta>]
 * Restaurar: docs/claude/respaldos.md
 */
import { mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { gzipSync } from 'node:zlib'

const REF = 'hoswfwhvcgqlqdmzpnce'
const RETENCION_DIAS = 30
const PAUSA_MS = 2_000
// De `auth` solo lo que hace falta para reconstruir las cuentas; sesiones, tokens y logs son efímeros.
const AUTH_TABLAS = ['auth.users', 'auth.identities', 'auth.mfa_factors']

const argv = process.argv.slice(2)
const iDest = argv.indexOf('--destino')
const RAIZ = iDest >= 0 ? argv[iDest + 1] : join(homedir(), 'OneDrive', 'GolfersPlus-Respaldos')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) { console.error('Falta SUPABASE_ACCESS_TOKEN (.env.local).'); process.exit(1) }

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
const dia = new Date().toISOString().slice(0, 10)
const carpeta = join(RAIZ, dia)
mkdirSync(carpeta, { recursive: true })

const publicas = (await sql(
  "select table_schema||'.'||table_name t from information_schema.tables where table_type='BASE TABLE' and table_schema='public' order by 1",
)).map(x => x.t)
const tablas = [...publicas, ...AUTH_TABLAS]
const migraciones = (await sql('select version, name from supabase_migrations.schema_migrations order by version')).map(m => `${m.version} ${m.name}`)

const manifiesto = { fecha: new Date().toISOString(), proyecto: REF, migraciones, tablas: {}, errores: [] }
let bytes = 0
for (const t of tablas) {
  try {
    // Filas y conteo en la MISMA consulta (misma snapshot): la verificación no depende de escrituras concurrentes.
    const [{ filas, n }] = await sql(`select coalesce(json_agg(x), '[]'::json) filas, count(*)::int n from ${ident(t)} x`)
    if (!Array.isArray(filas) || filas.length !== n) throw new Error(`verificación: exportó ${filas?.length} de ${n} filas`)
    const gz = gzipSync(JSON.stringify(filas))
    writeFileSync(join(carpeta, `${t}.json.gz`), gz)
    manifiesto.tablas[t] = n
    bytes += gz.length
  } catch (e) {
    manifiesto.errores.push(`${t}: ${e.message}`)
  }
  // Pausa entre tablas: en la instancia free (~0,5 GB) exportar todo de corrido degradó la base
  // en la primera corrida (un chequeo del vigilante falló). Espaciado, el pico de IO se diluye.
  await new Promise(r => setTimeout(r, PAUSA_MS))
}
writeFileSync(join(carpeta, '_manifiesto.json'), JSON.stringify(manifiesto, null, 2))

// Retención: borra solo carpetas con nombre de fecha (AAAA-MM-DD) más viejas que RETENCION_DIAS.
const limite = Date.now() - RETENCION_DIAS * 864e5
for (const d of readdirSync(RAIZ)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d === dia) continue
  if (Date.parse(`${d}T00:00:00Z`) < limite && statSync(join(RAIZ, d)).isDirectory()) rmSync(join(RAIZ, d), { recursive: true, force: true })
}

const filas = Object.values(manifiesto.tablas).reduce((a, b) => a + b, 0)
console.log(`Respaldo ${dia}: ${Object.keys(manifiesto.tablas).length}/${tablas.length} tablas · ${filas.toLocaleString('es-CL')} filas · ${(bytes / 1e6).toFixed(1)} MB comprimido → ${carpeta}`)
if (manifiesto.errores.length) {
  console.error(`ERRORES (${manifiesto.errores.length}):\n- ${manifiesto.errores.join('\n- ')}`)
  process.exit(1)
}
