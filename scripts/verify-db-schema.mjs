#!/usr/bin/env node
/**
 * scripts/verify-db-schema.mjs
 *
 * Valida que cada columna referenciada en código (.from('tabla').select('col1,col2'))
 * EXISTA en la BD de Supabase. Previene el bug del 7-may-2026 donde par_per_hole
 * fue añadida al SELECT de /perfil/historial pero nadie creó la migración —
 * resultando en error "No se pudieron cargar las tarjetas" en producción.
 *
 * Antes que nada bloquea si la rama edita, borra o renombra una migración que ya está en origin/main
 * (columnas-de-migraciones.mjs → revisarMigracionesTocadas). Siempre, con o sin credenciales y sin mirar
 * schema_migrations: editarla no cambia prod si ya la aplicó, y si no (espera aprobación, no corrió por un
 * evento) re-correr esa corrida aplica la versión vieja; borrarla o renombrarla rompe `supabase db push
 * --include-all`. Única salida: PERMITIR_TOCAR_MIGRACION=<version>[,<version>] para una migración que FALLÓ
 * al aplicarse, solo en la línea del push (en .env.local se ignora y avisa). Se verifica en código, fail-closed: exime solo si schema_migrations de prod es legible y NO tiene
 * esa versión (sin credenciales o con prod registrándola, bloquea igual) e imprime un aviso fuerte. Sin
 * origin/main legible, solo avisa. Antes de comparar hace `git fetch --quiet origin main` (si falla, avisa y usa la
 * copia local), y bloquea si la rama AGREGA una migración cuya versión prod ya registra.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local scripts/verify-db-schema.mjs   (igual que el hook pre-push)
 *
 * Exit codes:
 *   0 = OK (todas las columnas referenciadas existen en BD)
 *   1 = mismatches encontrados, o la rama edita/borra/renombra una migración que ya está en main (push
 *       debe bloquearse). Lo segundo sale 1 aunque falte .env.local: se revisa antes de las credenciales.
 *   2 = faltan credenciales (.env.local) o no se pudo conectar a BD (warning, no bloquea — entornos
 *       sin acceso; el hook pre-push lo acepta)
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
import { execSql } from './lib/exec-sql.mjs'
import {
  clasificarColumnasFaltantes,
  columnasDeMigraciones,
  explicarColumnaNueva,
  migracionesAgregadasEnLaRama,
  migracionesAplicadasEnProd,
  migracionesEnMain,
  PIE_COLUMNAS_CON_MIGRACION,
  revisarMigracionesTocadas,
} from './lib/columnas-de-migraciones.mjs'
import { esMigracionAplicable } from './lib/nombre-migracion.mjs'

const SRC_ROOT = path.resolve('src')

// 200 ms antes de salir: en Windows, process.exit con fetch abiertos dispara UV_HANDLE_CLOSING
// (aserción de libuv → exit code distinto de 0 con todo OK → el pre-push bloqueaba, 16-oct).
async function salir(code) {
  await new Promise(r => setTimeout(r, 200))
  process.exit(code)
}

// Antes que las credenciales: sin .env.local (exit 2) el pre-push igual debe bloquear esto. Solo lee prod si
// PERMITIR_TOCAR_MIGRACION pide una migración tocada (sin credenciales esa lectura da null y no exime).
const tocadas = await revisarMigracionesTocadas({ leerAplicadas: () => migracionesAplicadasEnProd(execSql) })
if (tocadas.bloquea) {
  console.error(tocadas.texto)
  await salir(1)
}
if (tocadas.texto) console.warn(tocadas.texto)

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠ verify-db-schema: faltan credenciales (.env.local) — skip')
  await salir(2)
}

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
  await salir(0)
}

// ── 3. Agrupar por tabla y consultar information_schema ────────
const tablesUsed = [...new Set(pairs.map(p => p.table))].sort()

const sql = `
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = ANY (ARRAY[${tablesUsed.map(t => `'${t}'`).join(',')}]::text[]);
`.trim()

let rows
try {
  rows = await execSql(sql)
} catch (err) {
  console.warn(`⚠ verify-db-schema: ${err.message} — skip`)
  await salir(2)
}
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
  await salir(0)
}

const noBaseline = mismatches.filter(m => !baseline.has(`${m.table}.${m.column}`))

// Columnas que faltan en prod pero que agrega una migración (columnas-de-migraciones.mjs explica los tres casos).
const MIGRACIONES = 'supabase/migrations'
const { deLaRama, enMainSinAplicar, nuevas: newMismatches } = clasificarColumnasFaltantes(noBaseline, {
  deLaRama: columnasDeMigraciones(migracionesAgregadasEnLaRama()),
  delRepo: columnasDeMigraciones(fs.existsSync(MIGRACIONES)
    ? fs.readdirSync(MIGRACIONES).map(f => `${MIGRACIONES}/${f}`).filter(esMigracionAplicable).sort()
    : []),
  enMain: migracionesEnMain(),
  aplicadas: await migracionesAplicadasEnProd(execSql),
})
if (deLaRama.length > 0) {
  console.log('verify-db-schema: columnas que aún no están en prod y que agrega una migración de esta rama (no bloquean):')
  for (const m of deLaRama) console.log(`   ${m.table}.${m.column} ← ${m.migracion} · la lee ${m.file}:${m.line}`)
}
if (enMainSinAplicar.length > 0) {
  console.warn('⚠ verify-db-schema: columnas que faltan en prod y que agrega una migración YA en main (no bloquean):')
  for (const m of enMainSinAplicar) {
    console.warn(`   ${m.table}.${m.column}: la agrega ${m.migracion}, ya en main; falta aprobar migraciones-prod. ` +
      `NO crear migración ni actualizar baseline. (la lee ${m.file}:${m.line})`)
  }
}

if (newMismatches.length === 0) {
  const knownCount = mismatches.length - noBaseline.length
  const suffix = knownCount > 0 ? ` (${knownCount} en baseline ignorados)` : ''
  console.log(`verify-db-schema: ${pairs.length} pares verificados, ${tablesUsed.length} tablas, 0 mismatches nuevos — OK${suffix}`)
  await salir(0)
}

// ── 6. Reportar y bloquear sólo lo nuevo ────────────────────────
console.error('')
console.error('❌ verify-db-schema: columnas NUEVAS referenciadas en código que NO existen en BD:')
console.error('')
for (const m of newMismatches) {
  const origen = m.migracion ? `  (${explicarColumnaNueva(m)})` : ''
  console.error(`   ${m.file}:${m.line}  →  ${m.table}.${m.column}${origen}`)
}
console.error('')
if (newMismatches.some(m => !m.migracion)) {
  console.error('Acción (columnas sin migración): crear migración en supabase/migrations/ que añada esas columnas,')
  console.error('o quitar la referencia del SELECT si fue añadida por error.')
}
if (newMismatches.some(m => m.migracion)) {
  console.error(PIE_COLUMNAS_CON_MIGRACION)
}
console.error('')
console.error('Si el mismatch ya existía y es deuda conocida, regenerar baseline con:')
console.error('  node --env-file=.env.local scripts/verify-db-schema.mjs --update-baseline')
await salir(1)
