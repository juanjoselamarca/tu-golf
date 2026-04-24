#!/usr/bin/env node
/**
 * scripts/run-sql.mjs
 *
 * Ejecuta un archivo SQL contra la BD de Supabase usando la Management API.
 * Soporta DO $$ blocks, transacciones explícitas, múltiples statements y
 * RAISE NOTICE/EXCEPTION en la salida.
 *
 * Uso:
 *   node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>
 *
 * Requiere en .env.local:
 *   SUPABASE_ACCESS_TOKEN      — token de Management API (sbp_...)
 *   NEXT_PUBLIC_SUPABASE_URL   — URL del proyecto (para derivar project_ref)
 *
 * Regla CLAUDE.md: es Claude (CTO) quien ejecuta TODO SQL — no se delega.
 */

import fs from 'node:fs'
import path from 'node:path'

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

if (!accessToken) {
  console.error('ERROR: falta SUPABASE_ACCESS_TOKEN en .env.local')
  process.exit(1)
}
if (!supabaseUrl) {
  console.error('ERROR: falta NEXT_PUBLIC_SUPABASE_URL en .env.local')
  process.exit(1)
}

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Uso: node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>')
  process.exit(1)
}

const absPath = path.resolve(sqlFile)
if (!fs.existsSync(absPath)) {
  console.error(`ERROR: archivo no existe: ${absPath}`)
  process.exit(1)
}

const sql = fs.readFileSync(absPath, 'utf8')

// Derivar project_ref de la URL: https://<ref>.supabase.co
const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)
if (!refMatch) {
  console.error(`ERROR: NEXT_PUBLIC_SUPABASE_URL no tiene formato esperado: ${supabaseUrl}`)
  process.exit(1)
}
const projectRef = refMatch[1]

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

console.log(`→ ejecutando ${path.basename(absPath)} (${sql.length} chars) contra project ${projectRef}`)

const t0 = Date.now()
let response
try {
  response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
} catch (err) {
  console.error('ERROR de red:', err.message)
  process.exit(1)
}

const ms = Date.now() - t0
const bodyText = await response.text()

if (!response.ok) {
  console.error(`ERROR HTTP ${response.status} en ${ms}ms:`)
  console.error(bodyText)
  process.exit(1)
}

// La Management API devuelve: array de rows si hay SELECT, o [] si es DML/DO.
// Si hubo RAISE NOTICE, Supabase los incluye en el response body.
let parsed
try {
  parsed = JSON.parse(bodyText)
} catch {
  console.log(bodyText)
  process.exit(0)
}

console.log(`✓ OK en ${ms}ms`)
if (Array.isArray(parsed) && parsed.length > 0) {
  console.log(`rows: ${parsed.length}`)
  console.log(JSON.stringify(parsed.slice(0, 20), null, 2))
  if (parsed.length > 20) console.log(`... (+${parsed.length - 20} más)`)
} else {
  console.log('sin filas (DML/DDL/DO block)')
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    console.log(JSON.stringify(parsed, null, 2))
  }
}
