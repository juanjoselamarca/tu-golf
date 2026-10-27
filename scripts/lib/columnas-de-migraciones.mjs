/**
 * Columnas que agregan las migraciones del repo (`ALTER TABLE … ADD COLUMN …`), como `tabla.columna`.
 *
 * Lo usa verify-db-schema.mjs: compara el código contra la base de PROD, y una migración nueva del PR se aplica
 * recién después del merge (workflow `migraciones-prod`). Sin esto, toda columna nueva leída en el mismo PR que
 * la crea bloqueaba el push con "crear migración", aunque la migración estuviera ahí.
 *
 * Tres casos (`clasificarColumnasFaltantes`), según qué migración agrega la columna que falta en prod:
 *  - una que AGREGA esta rama (git diff contra origin/main): se informa, no bloquea (salvo que prod ya registre su
 *    versión: editada tras aplicarla o versión repetida);
 *  - una que ya está en origin/main y que prod NO registra en supabase_migrations.schema_migrations: falta aprobar
 *    `migraciones-prod`. Avisa SIN bloquear (el pre-push de otra rama no puede depender de una aprobación manual) y
 *    dice explícitamente NO crear migración ni actualizar baseline. "Sin aplicar" se COMPRUEBA: si prod ya registra
 *    esa versión y no tiene la columna (renombrada, eliminada, rollback), bloquea; si no se pudo leer el registro o
 *    origin/main, no se exime nada;
 *  - ninguna migración (o una que no está ni en la rama ni en main): bloquea (el bug del 7-may-2026 de par_per_hole).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { versionDeMigracion } from './nombre-migracion.mjs'

export { versionDeMigracion }

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

/**
 * `tabla.columna` → la ÚLTIMA migración (en el orden dado: el llamador los pasa ordenados por versión) que la
 * agrega. Si M1 la agrega, M2 la renombra o la borra y M3 la vuelve a agregar, la que decide si falta aplicarla es M3.
 */
export function columnasDeMigraciones(archivos, leer = f => fs.readFileSync(f, 'utf8')) {
  const out = new Map()
  for (const f of archivos) {
    for (const c of columnasAgregadasEnSql(leer(f))) out.set(c, f)
  }
  return out
}

/**
 * Migraciones (.sql, sin `rollback/`) que ya están en `base` y que la rama MODIFICA. Una migración mergeada ya se
 * aplicó (o se aplicará tal cual) en prod: editarla no cambia prod y el verify la daría por "ya aplicada". Sin git o
 * sin la base: null (no se sabe; se avisa sin bloquear).
 */
export function migracionesEditadasEnLaRama({
  base = 'origin/main',
  git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
} = {}) {
  try {
    return git(['diff', '--name-only', '--diff-filter=M', `${base}...HEAD`, '--', 'supabase/migrations/'])
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(f => f.endsWith('.sql') && !f.includes('/rollback/'))
  } catch {
    return null
  }
}

/** Qué decir de las migraciones editadas: `bloquea` solo si se SABE que la rama edita alguna que está en main. */
export function explicarMigracionesEditadas(editadas) {
  if (editadas === null) {
    return { bloquea: false, texto: '⚠ verify-db-schema: no se pudo leer origin/main para comprobar que ninguna migración ya mergeada se editó (corre `git fetch origin main`)' }
  }
  if (editadas.length === 0) return { bloquea: false, texto: '' }
  return {
    bloquea: true,
    texto: `❌ verify-db-schema: esta rama edita migraciones que ya están en main (${editadas.join(', ')}): las migraciones aplicadas no se editan: crea una nueva`,
  }
}

const gitPorDefecto = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

/**
 * Migraciones (.sql, sin `rollback/`) que existen en `base`. `git ls-tree --name-only origin/main -- supabase/migrations/`
 * lista cada archivo con su ruta (y `supabase/migrations/rollback` como entrada de directorio, que se descarta).
 * Sin git o sin la base: null (no se sabe qué hay en main).
 */
export function migracionesEnMain({ base = 'origin/main', git = gitPorDefecto } = {}) {
  try {
    return new Set(git(['ls-tree', '--name-only', base, '--', 'supabase/migrations/'])
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(f => f.endsWith('.sql') && !f.includes('/rollback/')))
  } catch {
    return null
  }
}

/** Versiones que prod registra como aplicadas; null si la lectura falla (entonces no se exime nada). */
export async function migracionesAplicadasEnProd(execSql) {
  try {
    const filas = await execSql('select version from supabase_migrations.schema_migrations')
    return new Set(filas.map(f => String(f.version)))
  } catch {
    return null
  }
}

/**
 * Reparte las columnas que faltan en prod (`{ table, column, ... }`) según la migración que las agrega:
 * `deLaRama` y `enMainSinAplicar` no bloquean; `nuevas` sí, con un `motivo` cuando hay migración de por medio
 * (lo explica `explicarColumnaNueva`). `delRepo`: columna → archivo, de todas las migraciones. `enMain` y
 * `aplicadas` (versiones en schema_migrations de prod) son null si no se pudieron leer.
 */
export function clasificarColumnasFaltantes(faltantes, { deLaRama, delRepo, enMain, aplicadas }) {
  const out = { deLaRama: [], enMainSinAplicar: [], nuevas: [] }
  const yaAplicada = archivo => !!aplicadas && aplicadas.has(versionDeMigracion(archivo))
  for (const m of faltantes) {
    const clave = `${m.table}.${m.column}`
    const deRama = deLaRama.get(clave)
    if (deRama) {
      // Prod ya registra la versión de una migración que esta rama agrega: o se editó tras aplicarla, o la versión
      // choca con otra migración.
      if (yaAplicada(deRama)) out.nuevas.push({ ...m, migracion: deRama, motivo: 'rama_aplicada' })
      else out.deLaRama.push({ ...m, migracion: deRama })
      continue
    }
    const migracion = delRepo.get(clave)
    if (!migracion) out.nuevas.push(m)
    else if (enMain === null) out.nuevas.push({ ...m, migracion, motivo: 'sin_main' })
    else if (!enMain.has(migracion)) out.nuevas.push({ ...m, migracion, motivo: 'fuera_de_main' })
    else if (aplicadas === null) out.nuevas.push({ ...m, migracion, motivo: 'sin_registro' })
    else if (yaAplicada(migracion)) out.nuevas.push({ ...m, migracion, motivo: 'aplicada' })
    else out.enMainSinAplicar.push({ ...m, migracion })
  }
  return out
}

/** Pie del reporte para columnas que agrega una migración: cada motivo trae su propia orden, el pie no agrega otra. */
export const PIE_COLUMNAS_CON_MIGRACION = 'Columnas que ya agrega una migración: seguir lo que dice cada una entre paréntesis.'

/** Texto para una columna que bloquea y que alguna migración agrega (vacío si ninguna la agrega). */
export function explicarColumnaNueva(m) {
  switch (m.motivo) {
    case 'aplicada':
      return `la agregó ${m.migracion} (ya aplicada) y prod no la tiene: ¿renombrada o eliminada? NO duplicar la migración; ` +
        'si la agregaste editando esa migración, revierte la edición y crea una migración NUEVA'
    case 'rama_aplicada':
      return `prod ya registra la versión ${versionDeMigracion(m.migracion)}: si la editaste después de aplicarla, el cambio va ` +
        'en una migración NUEVA; si otra migración usa esa versión, renombra la tuya con un timestamp nuevo'
    case 'sin_main':
      return `la agrega ${m.migracion}, pero no se pudo leer origin/main: corre \`git fetch origin main\` y vuelve a intentar`
    case 'fuera_de_main':
      return `la agrega ${m.migracion}, que no está ni en esta rama ni en main: NO duplicarla`
    case 'sin_registro':
      return `la agrega ${m.migracion}, ya en main, pero no se pudo leer supabase_migrations.schema_migrations de prod para comprobar si falta aplicarla; reintenta el push, NO crear migración`
    default:
      return ''
  }
}
