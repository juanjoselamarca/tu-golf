/**
 * Columnas que agregan las migraciones del repo (`ALTER TABLE … ADD COLUMN …`), como `tabla.columna`.
 *
 * Lo usa verify-db-schema.mjs: compara el código contra la base de PROD, y una migración nueva del PR se aplica
 * recién después del merge (workflow `migraciones-prod`). Sin esto, toda columna nueva leída en el mismo PR que
 * la crea bloqueaba el push con "crear migración", aunque la migración estuviera ahí. Una columna que falta en
 * prod y que NINGUNA migración agrega sigue bloqueando (el bug del 7-may-2026 de par_per_hole).
 */
import fs from 'node:fs'
import path from 'node:path'

const NO_SON_COLUMNAS = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude'])

/** `tabla.columna` de cada `ADD [COLUMN] [IF NOT EXISTS] col` dentro de un `ALTER TABLE` del SQL dado. */
export function columnasAgregadasEnSql(sql) {
  const out = new Set()
  const sinComentarios = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const sentencia of sinComentarios.split(';')) {
    const tabla = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:"?public"?\.)?"?(\w+)"?/i.exec(sentencia)?.[1]
    if (!tabla) continue
    for (const m of sentencia.matchAll(/\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
      const col = m[1].toLowerCase()
      if (!NO_SON_COLUMNAS.has(col) && col !== 'column') out.add(`${tabla.toLowerCase()}.${col}`)
    }
  }
  return out
}

/** Todas las columnas que agregan las migraciones de `dir` (sin `rollback/`). */
export function columnasDeMigraciones(dir = path.resolve('supabase/migrations')) {
  const out = new Set()
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.sql')) continue
    for (const c of columnasAgregadasEnSql(fs.readFileSync(path.join(dir, f), 'utf8'))) out.add(c)
  }
  return out
}
