/**
 * Columnas que agregan las migraciones del repo (`ALTER TABLE … ADD COLUMN …`), como `tabla.columna`.
 *
 * Lo usa verify-db-schema.mjs: compara el código contra la base de PROD, y una migración nueva del PR se aplica
 * recién después del merge (workflow `migraciones-prod`). Sin esto, toda columna nueva leída en el mismo PR que
 * la crea bloqueaba el push con "crear migración", aunque la migración estuviera ahí.
 *
 * La excepción vale SOLO para las migraciones que la rama agrega (git diff contra origin/main). Una migración que
 * ya está en main y no se aplicó en prod es justamente lo que el check tiene que cazar, y una columna que ninguna
 * migración de la rama agrega sigue bloqueando (el bug del 7-may-2026 de par_per_hole).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

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

/**
 * Migraciones (.sql, sin `rollback/`) que la rama AGREGA respecto de `base`. Sin git, sin la base o con
 * cualquier error devuelve [] (no hay excepción: el check bloquea como siempre).
 */
export function migracionesAgregadasEnLaRama({
  base = 'origin/main',
  git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
} = {}) {
  try {
    return git(['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'supabase/migrations'])
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(f => f.endsWith('.sql') && !f.includes('/rollback/'))
  } catch {
    return []
  }
}

/** `tabla.columna` → archivo de migración que la agrega, para los archivos dados. */
export function columnasDeMigraciones(archivos, leer = f => fs.readFileSync(f, 'utf8')) {
  const out = new Map()
  for (const f of archivos) {
    for (const c of columnasAgregadasEnSql(leer(f))) if (!out.has(c)) out.set(c, f)
  }
  return out
}
