#!/usr/bin/env node
/**
 * scripts/verify-db-schema.mjs
 *
 * Valida que cada columna referenciada en código (.from('tabla').select('col1,col2')) EXISTA en supabase/schema.sql,
 * el esquema que dejan todas las migraciones (el check `esquema` lo mantiene igual a ellas). Previene el bug del
 * 7-may-2026 donde par_per_hole fue añadida al SELECT de /perfil/historial pero nadie creó la migración, resultando en
 * error "No se pudieron cargar las tarjetas" en producción.
 *
 * No lee ninguna base: nada local ni de test toca prod. Que la migración ya esté APLICADA en prod antes de mergear el
 * código que la lee lo cuida el orden de los PR (migración primero, docs/CONVENCIONES_TECNICAS.md), no este check.
 *
 * Antes que nada bloquea si la rama edita, borra o renombra una migración que ya está en origin/main (migraciones-tocadas.mjs
 * → revisarMigracionesTocadas). Siempre: editarla no cambia prod si ya la aplicó, y si no (espera aprobación, no corrió
 * por un evento) re-correr esa corrida aplica la versión vieja; borrarla o renombrarla rompe `supabase db push
 * --include-all`. Única salida: PERMITIR_TOCAR_MIGRACION=<version>[,<version>] para una migración que FALLÓ al
 * aplicarse, solo en la línea del push (en .env.local se ignora y avisa). Acá exime sin comprobar prod; en el PR lo
 * decide la etiqueta permitir-tocar-migracion:<version> que pone Juanjo. Sin origin/main legible, solo avisa. Antes de
 * comparar hace `git fetch --quiet origin main` (si falla, avisa y usa la copia local). Una migración que la rama AGREGA
 * bloquea si main ya trae ese nombre con otro contenido o esa versión con otro nombre.
 *
 * Uso:
 *   node scripts/verify-db-schema.mjs   (igual que el hook pre-push)
 *   … --solo-migraciones   solo el bloqueo de migraciones tocadas y sale (el atajo del pre-push lo corre igual)
 *   … --solo-columnas      solo las columnas, sin el bloqueo de migraciones tocadas (ci.yml)
 *
 * Exit codes:
 *   0 = OK (todas las columnas referenciadas existen en schema.sql)
 *   1 = mismatches encontrados, o la rama edita/borra/renombra una migración que ya está en main (push debe bloquearse)
 *
 * Limitaciones conocidas (false negatives — no es exhaustivo):
 *   - Skip selects con '*' (no hay columnas explícitas que validar)
 *   - Skip selects con '(' o ':' (joins/relaciones — sintaxis Supabase compleja)
 *   - Skip from(varname) dinámico
 *   - Skip rondas con template literals
 *   - Skip vistas: schema.sql no las trae
 *
 * Lo que SÍ detecta: el caso común de listar columnas hardcoded que no existen.
 */

import fs from 'node:fs'
import path from 'node:path'
import { revisarMigracionesTocadas } from './lib/migraciones-tocadas.mjs'
import { columnasPorTabla } from './lib/esquema-sql.mjs'

const SRC_ROOT = path.resolve('src')

// En CI el bloqueo de migraciones tocadas lo hace migraciones-inmutables.yml, que tiene la historia que el checkout no trae.
if (!process.argv.includes('--solo-columnas')) {
  const tocadas = revisarMigracionesTocadas()
  if (tocadas.bloquea) {
    console.error(tocadas.texto)
    process.exit(1)
  }
  if (tocadas.texto) console.warn(tocadas.texto)
}
if (process.argv.includes('--solo-migraciones')) process.exit(0)

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

// ── 3. Columnas por tabla según supabase/schema.sql ─────────────
const tablesUsed = [...new Set(pairs.map(p => p.table))].sort()
let dbColsByTable
try {
  dbColsByTable = columnasPorTabla(fs.readFileSync(path.resolve('supabase/schema.sql'), 'utf8'))
} catch (err) {
  console.error(`❌ verify-db-schema: ${err.message}`)
  process.exit(1)
}

// ── 4. Diff: ¿alguna columna referenciada NO existe en schema.sql? ─
const mismatches = []
for (const { table, columns, file, line } of pairs) {
  const dbCols = dbColsByTable.get(table)
  if (!dbCols) {
    // Tabla no encontrada (vista, rpc disfrazada o FK indirecta)
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
// Para regenerar: node scripts/verify-db-schema.mjs --update-baseline
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
    _comment: 'Mismatches schema-vs-code conocidos. Bugs reales que el hook ignora hasta que se arreglen. Regenerar: node scripts/verify-db-schema.mjs --update-baseline',
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
console.error('❌ verify-db-schema: columnas NUEVAS referenciadas en código que NO existen en supabase/schema.sql:')
console.error('')
for (const m of newMismatches) console.error(`   ${m.file}:${m.line}  →  ${m.table}.${m.column}`)
console.error('')
console.error('Acción: crear la migración que añada esas columnas y regenerar supabase/schema.sql (node scripts/ci/esquema.mjs, con')
console.error('Docker; sin Docker, pushea primero la migración sola y toma el artifact schema-sql del check Esquema de su PR),')
console.error('o quitar la referencia del SELECT si fue añadida por error. Si la migración ya existe, falta regenerar schema.sql.')
console.error('')
console.error('Si el mismatch ya existía y es deuda conocida, regenerar baseline con:')
console.error('  node scripts/verify-db-schema.mjs --update-baseline')
process.exit(1)
