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
import { esMigracionAplicable, versionDeMigracion } from './nombre-migracion.mjs'

export { versionDeMigracion }

const gitPorDefecto = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

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
 * cualquier error devuelve [] (no hay excepción: el check bloquea como siempre). `--no-renames`: con la detección de
 * renombres, una migración nueva parecida a una borrada sale como R (no A) y quedaba fuera.
 */
export function migracionesAgregadasEnLaRama({
  base = 'origin/main',
  git = gitPorDefecto,
} = {}) {
  try {
    return git(['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '--diff-filter=A', `${base}...HEAD`, '--', 'supabase/migrations'])
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(esMigracionAplicable)
  } catch {
    return []
  }
}

/**
 * `tabla.columna` → la ÚLTIMA migración (por nombre de archivo = versión, ordenado acá: readdir no garantiza orden en
 * Linux) que la agrega. Si M1 la agrega, M2 la renombra o la borra y M3 la vuelve a agregar, la que decide si falta
 * aplicarla es M3.
 */
export function columnasDeMigraciones(archivos, leer = f => fs.readFileSync(f, 'utf8')) {
  const out = new Map()
  const nombre = f => f.split(/[\\/]/).pop()
  for (const f of [...archivos].sort((a, b) => (nombre(a) < nombre(b) ? -1 : nombre(a) > nombre(b) ? 1 : 0))) {
    for (const c of columnasAgregadasEnSql(leer(f))) out.set(c, f)
  }
  return out
}

/**
 * Migraciones (.sql, sin `rollback/`) que están en `base` y que la rama MODIFICA (`editadas`) o BORRA (`borradas`;
 * con `--no-renames` un renombre es borrar la vieja y agregar la nueva). Si prod ya la aplicó, editarla no cambia prod, y
 * borrarla o renombrarla rompe `supabase db push --include-all` ("Remote migration versions not found") y frena
 * todas las siguientes; si no la aplicó, eso lo decide `explicarMigracionesTocadas`. Solo cuenta lo que existe en `enMain`
 * (`migracionesEnMain`). Sin git, sin la base o sin `enMain`: null (no se sabe; se avisa sin bloquear).
 */
export function migracionesTocadasEnLaRama({ base = 'origin/main', git = gitPorDefecto, enMain } = {}) {
  if (!enMain) return null
  try {
    const out = { editadas: [], borradas: [] }
    for (const linea of git(['-c', 'core.quotePath=false', 'diff', '--name-status', '--no-renames', '--diff-filter=MD', `${base}...HEAD`, '--', 'supabase/migrations/']).split(/\r?\n/)) {
      const [estado, archivo] = linea.trim().split(/\t/)
      if (!archivo || !esMigracionAplicable(archivo) || !enMain.has(archivo)) continue
      if (estado === 'M') out.editadas.push(archivo)
      else if (estado === 'D') out.borradas.push(archivo)
    }
    return out
  } catch {
    return null
  }
}

/**
 * Qué decir de las migraciones de main que la rama toca. "Está en main" no es "está aplicada en prod": si una
 * migración mergeada falló en `migraciones-prod`, corregirla editándola es legítimo. `aplicadas` (versiones en
 * supabase_migrations.schema_migrations de prod; null si no hay credenciales o no se pudo leer) decide:
 *  - prod la registra → bloquea (editarla no cambia prod; borrarla o renombrarla rompe `db push --include-all`);
 *  - prod NO la registra → avisa sin bloquear (¿falló al aplicarse?);
 *  - no se sabe (sin registro legible o sin versión en el nombre) → bloquea, tratada como aplicada.
 */
export function explicarMigracionesTocadas(tocadas, aplicadas = null) {
  if (tocadas === null) {
    return { bloquea: false, texto: '⚠ verify-db-schema: no se pudo leer origin/main para comprobar que ninguna migración ya mergeada se editó, borró ni renombró (corre `git fetch origin main`)' }
  }
  const estado = archivo => {
    const version = versionDeMigracion(archivo)
    if (aplicadas === null || version === null) return 'sin_saber'
    return aplicadas.has(version) ? 'aplicada' : 'sin_aplicar'
  }
  const textos = []
  const avisos = []
  for (const [grupo, motivo] of [
    ['aplicada', 'que prod ya aplicó'],
    ['sin_saber', 'que ya están en main (no se pudo comprobar en prod si están aplicadas: se tratan como aplicadas)'],
  ]) {
    const editadas = tocadas.editadas.filter(f => estado(f) === grupo)
    const borradas = tocadas.borradas.filter(f => estado(f) === grupo)
    if (editadas.length > 0) {
      textos.push(`❌ verify-db-schema: esta rama edita migraciones ${motivo} (${editadas.join(', ')}): una migración aplicada no se edita ` +
        '(prod no la vuelve a aplicar): revierte la edición y pon el cambio en una migración NUEVA. Si no la editaste tú: `git fetch origin main`')
    }
    if (borradas.length > 0) {
      textos.push(`❌ verify-db-schema: esta rama borra o renombra migraciones ${motivo} (${borradas.join(', ')}): una migración aplicada no se ` +
        'borra ni renombra (supabase db push --include-all falla con "Remote migration versions not found" y frena las siguientes): ' +
        'restáurala con su nombre; si hay que deshacer su efecto, va en una migración NUEVA. Si no la tocaste tú: `git fetch origin main`')
    }
  }
  const sinAplicar = [...tocadas.editadas, ...tocadas.borradas].filter(f => estado(f) === 'sin_aplicar')
  if (sinAplicar.length > 0) {
    avisos.push(`⚠ verify-db-schema: esta rama edita o borra migraciones de main que prod NO registra como aplicadas (${sinAplicar.join(', ')}): ` +
      '¿falló al aplicarse? se puede corregir editándola; ojo que bloquea a las siguientes')
  }
  return { bloquea: textos.length > 0, texto: [...textos, ...avisos].join('\n') }
}

/**
 * Migraciones (.sql, sin `rollback/`) que existen en `base`. `git ls-tree --name-only origin/main -- supabase/migrations/`
 * lista cada archivo con su ruta (y `supabase/migrations/rollback` como entrada de directorio, que se descarta).
 * Sin git o sin la base: null (no se sabe qué hay en main).
 */
export function migracionesEnMain({ base = 'origin/main', git = gitPorDefecto } = {}) {
  try {
    return new Set(git(['-c', 'core.quotePath=false', 'ls-tree', '--name-only', base, '--', 'supabase/migrations/'])
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(esMigracionAplicable))
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
    // Sin versión legible no se puede saber si prod la aplicó: no se exime (ni como de la rama ni como pendiente).
    const sinVersion = deRama ?? delRepo.get(clave)
    if (sinVersion && versionDeMigracion(sinVersion) === null) {
      out.nuevas.push({ ...m, migracion: sinVersion, motivo: 'sin_version' })
      continue
    }
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
        'si se agregó editando esa migración ya aplicada, la columna va en una migración NUEVA (si la edición es de ' +
        'esta rama, revierte además la edición; si ya está en main, no la toques)'
    case 'rama_aplicada':
      return `prod ya registra la versión ${versionDeMigracion(m.migracion)}: si la editaste después de aplicarla, el cambio va ` +
        'en una migración NUEVA; si otra migración usa esa versión, renombra la tuya con un timestamp nuevo'
    case 'sin_version':
      return `la agrega ${m.migracion}, cuyo nombre no tiene la versión que lee la CLI (<yyyyMMddHHmmss>_nombre.sql): ` +
        'no se puede comprobar si prod la aplicó; renómbrala'
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
