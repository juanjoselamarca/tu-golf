#!/usr/bin/env node
/**
 * scripts/verify-db-schema.mjs
 *
 * Valida que cada columna referenciada en código (.from('tabla').select('col1,col2'))
 * EXISTA en la BD de Supabase. Previene el bug del 7-may-2026 donde par_per_hole
 * fue añadida al SELECT de /perfil/historial pero nadie creó la migración —
 * resultando en error "No se pudieron cargar las tarjetas" en producción.
 *
 * Uso:
 *   node --env-file=.env.local scripts/verify-db-schema.mjs
 *
 * Exit codes:
 *   0 = OK (todas las columnas referenciadas existen en BD)
 *   1 = mismatches encontrados (push debe bloquearse)
 *   2 = no se pudo conectar a BD (warning, no bloquea — entornos sin acceso)
 *
 * Limitaciones conocidas (false negatives — no es exhaustivo):
 *   - Skip selects con '*' (no hay columnas explícitas que validar)
 *   - Skip selects con '(' o ':' (joins/relaciones — sintaxis Supabase compleja)
 *   - Skip from(varname) dinámico
 *   - Skip rondas con template literals
 *
 * Lo que SÍ detecta: el caso común de listar columnas hardcoded que no existen.
 */

import fs from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.resolve('src')
const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

if (!accessToken || !supabaseUrl) {
  console.warn('⚠ verify-db-schema: faltan credenciales (.env.local) — skip')
  process.exit(2)
}

const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)
if (!refMatch) {
  console.warn(`⚠ verify-db-schema: URL inválida ${supabaseUrl} — skip`)
  process.exit(2)
}
const endpoint = `https://api.supabase.com/v1/projects/${refMatch[1]}/database/query`

// ── 1. Walk src/ y recolectar archivos .ts/.tsx ─────────────────
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      walk(full, files)
    } else if (entry.isFile() && /\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

const files = walk(SRC_ROOT)

// ── 2. Extraer (tabla, columnas) de .from()...select() ──────────
// Busca .from('TABLA') seguido en el mismo chain por .select('cols').
// Negative lookahead `(?!\.from\()` evita cruzar a otra .from() intermedia
// (caso real: .from('A').delete() ... .from('B').select('x') — el matching
// debe asociar 'x' a B, no a A). Cross-line, non-greedy.
const PAIR_RE = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)((?:(?!\.from\()[\s\S]){0,1500}?)\.select\(\s*['"`]([^'"`]+)['"`]/gi

const pairs = [] // { table, columns: [string], file, line }

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  let m
  PAIR_RE.lastIndex = 0
  while ((m = PAIR_RE.exec(text)) !== null) {
    const [, table, , selectArg] = m
    // Skip patrones complejos que no podemos validar estáticamente
    if (selectArg.includes('*')) continue              // .select('*')
    if (selectArg.includes('(')) continue              // joins: 'tee:tees(name)'
    if (selectArg.includes(':')) continue              // aliases con relación
    if (selectArg.includes('${')) continue             // template literals
    if (selectArg.includes('count')) continue          // .select('id', { count: 'exact' })

    const columns = selectArg
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
      .filter(c => /^[a-z_][a-z0-9_]*$/i.test(c))      // sólo identificadores limpios

    if (columns.length === 0) continue

    // Línea aproximada para reporting
    const offset = m.index
    const lineNo = text.slice(0, offset).split('\n').length

    pairs.push({ table, columns, file: path.relative('.', file), line: lineNo })
  }
}

if (pairs.length === 0) {
  console.log('verify-db-schema: 0 pares (tabla, columnas) extraíbles — OK')
  process.exit(0)
}

// ── 3. Agrupar por tabla y consultar information_schema ────────
const tablesUsed = [...new Set(pairs.map(p => p.table))].sort()

const sql = `
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = ANY (ARRAY[${tablesUsed.map(t => `'${t}'`).join(',')}]::text[]);
`.trim()

let resp
try {
  resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
} catch (err) {
  console.warn(`⚠ verify-db-schema: error de red (${err.message}) — skip`)
  process.exit(2)
}

if (!resp.ok) {
  console.warn(`⚠ verify-db-schema: HTTP ${resp.status} — skip`)
  console.warn(await resp.text())
  process.exit(2)
}

const rows = await resp.json()
const dbColsByTable = new Map()
for (const row of rows) {
  if (!dbColsByTable.has(row.table_name)) dbColsByTable.set(row.table_name, new Set())
  dbColsByTable.get(row.table_name).add(row.column_name)
}

// ── 4. Diff: ¿alguna columna referenciada NO existe en BD? ──────
const mismatches = []
for (const { table, columns, file, line } of pairs) {
  const dbCols = dbColsByTable.get(table)
  if (!dbCols) {
    // Tabla no encontrada (puede ser vista, rpc-disfrazada, o FK indirecta)
    // No fallamos aquí — sólo loggeamos como warning.
    continue
  }
  for (const col of columns) {
    if (!dbCols.has(col)) {
      mismatches.push({ table, column: col, file, line })
    }
  }
}

// ── 5. Aplicar baseline de mismatches conocidos ─────────────────
// Bugs preexistentes que no podemos arreglar en este commit pero queremos
// documentar como deuda. El hook bloquea sólo mismatches NUEVOS.
// Para regenerar: node --env-file=.env.local scripts/verify-db-schema.mjs --update-baseline
const baselinePath = path.resolve('scripts/db-schema-baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')

let baseline = new Set()
if (fs.existsSync(baselinePath) && !updateBaseline) {
  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    if (Array.isArray(data.known_mismatches)) {
      for (const m of data.known_mismatches) baseline.add(`${m.table}.${m.column}`)
    }
  } catch (err) {
    console.warn(`⚠ baseline corrupto (${err.message}) — ignorando`)
  }
}

if (updateBaseline) {
  const knownMismatches = mismatches
    .map(m => ({ table: m.table, column: m.column, file: m.file, line: m.line }))
    .sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`))
  const out = {
    _comment: 'Mismatches schema-vs-code conocidos. Bugs reales que el hook ignora hasta que se arreglen. Regenerar: node --env-file=.env.local scripts/verify-db-schema.mjs --update-baseline',
    generated_at: new Date().toISOString(),
    known_mismatches: knownMismatches,
  }
  fs.writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n')
  console.log(`✓ baseline actualizado: ${knownMismatches.length} mismatches en ${baselinePath}`)
  process.exit(0)
}

const newMismatches = mismatches.filter(m => !baseline.has(`${m.table}.${m.column}`))

if (newMismatches.length === 0) {
  const knownCount = mismatches.length - newMismatches.length
  const suffix = knownCount > 0 ? ` (${knownCount} en baseline ignorados)` : ''
  console.log(`verify-db-schema: ${pairs.length} pares verificados, ${tablesUsed.length} tablas, 0 mismatches nuevos — OK${suffix}`)
  process.exit(0)
}

// ── 6. Reportar y bloquear sólo lo nuevo ────────────────────────
console.error('')
console.error('❌ verify-db-schema: columnas NUEVAS referenciadas en código que NO existen en BD:')
console.error('')
for (const m of newMismatches) {
  console.error(`   ${m.file}:${m.line}  →  ${m.table}.${m.column}`)
}
console.error('')
console.error('Acción: crear migración en supabase/migrations/ que añada esas columnas,')
console.error('o quitar la referencia del SELECT si fue añadida por error.')
console.error('')
console.error('Si el mismatch ya existía y es deuda conocida, regenerar baseline con:')
console.error('  node --env-file=.env.local scripts/verify-db-schema.mjs --update-baseline')
process.exit(1)
