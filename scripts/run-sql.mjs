#!/usr/bin/env node
/**
 * scripts/run-sql.mjs
 *
 * Ejecuta una consulta de SOLO LECTURA (un SELECT/WITH por archivo) contra la BD de Supabase vía exec_sql y la
 * service key (scripts/lib/exec-sql.mjs). Cualquier escritura o DDL falla en Postgres: los cambios de schema o
 * datos van como migración en supabase/migrations/ (PR → merge → workflow migraciones-prod).
 *
 * Uso:
 *   node --env-file=.env.local scripts/run-sql.mjs <archivo.sql>
 *
 * Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'node:fs'
import path from 'node:path'
import { projectRefDe } from './lib/supabase-ref.mjs'
import { execSql } from './lib/exec-sql.mjs'

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
const projectRef = projectRefDe(process.env.NEXT_PUBLIC_SUPABASE_URL)

console.log(`→ ejecutando ${path.basename(absPath)} (${sql.length} chars) contra project ${projectRef} (solo lectura)`)

const t0 = Date.now()
let rows
try {
  rows = await execSql(sql)
} catch (err) {
  console.error(`ERROR en ${Date.now() - t0}ms: ${err.message}`)
  process.exit(1)
}

console.log(`✓ OK en ${Date.now() - t0}ms`)
if (rows.length > 0) {
  console.log(`rows: ${rows.length}`)
  console.log(JSON.stringify(rows.slice(0, 20), null, 2))
  if (rows.length > 20) console.log(`... (+${rows.length - 20} más)`)
} else {
  console.log('sin filas')
}
