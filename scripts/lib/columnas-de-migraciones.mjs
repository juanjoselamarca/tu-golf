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
import { esMigracionAplicable, VERSION_CLI, versionDeMigracion } from './nombre-migracion.mjs'
import { PROD_REF, projectRefDe } from './supabase-ref.mjs'

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
 * con `--no-renames` un renombre es borrar la vieja y agregar la nueva). Solo cuenta lo que existe en `enMain`
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

/** Variable que exime de `explicarMigracionesTocadas` las versiones dadas (separadas por coma). */
export const VARIABLE_PERMITIR_TOCAR = 'PERMITIR_TOCAR_MIGRACION'

/**
 * Qué hacer con las corridas de migraciones-prod al usar PERMITIR_TOCAR_MIGRACION. Una corrida anterior al merge corre
 * el commit viejo: aprobarla o re-correrla aplica la versión original. docs/CONVENCIONES_TECNICAS.md lo copia literal
 * (lo compara un test).
 */
export const TEXTO_CORRIDAS_PERMITIR_TOCAR = 'rechaza las pendientes y no hagas Re-run de ninguna corrida anterior al merge, tampoco la que falló; tras el merge aprueba la corrida que dispara el merge (o Run workflow desde main)'

const valoresDe = valor => String(valor ?? '').split(',').map(v => v.trim()).filter(Boolean)

/** Versiones válidas (14 dígitos) de `PERMITIR_TOCAR_MIGRACION=<version>[,<version>…]` (vacía o ausente: ninguna). */
export function versionesPermitidas(valor) {
  return new Set(valoresDe(valor).filter(v => VERSION_CLI.test(v)))
}

/** Valores de `PERMITIR_TOCAR_MIGRACION` que no son una versión de 14 dígitos (se ignoran y se avisan). */
export function valoresInvalidosPermitir(valor) {
  return valoresDe(valor).filter(v => !VERSION_CLI.test(v))
}

/**
 * Qué decir de las migraciones de main que la rama toca. Editar, borrar o renombrar una migración que ya está en
 * origin/main bloquea: si prod ya la aplicó, editarla no cambia prod; si no (espera aprobación, no corrió por un evento),
 * aprobar o re-correr esa corrida aplica la versión ORIGINAL (corre el commit viejo) y `db push` se salta la corrección;
 * borrarla o renombrarla rompe `db push` ("Remote migration versions not found") y frena todas las siguientes.
 *
 * Única salida, `PERMITIR_TOCAR_MIGRACION=<version>` (`permitidas`), para una migración que FALLÓ al aplicarse. Se
 * verifica en código, fail-closed: exime solo si `aplicadas` (schema_migrations de prod) es legible y NO tiene esa
 * versión. Que la corrida del workflow haya fallado no basta: también falla después de un `db push` exitoso (huella,
 * canarios). Si prod la registra, o no se pudo leer (null), bloquea igual.
 */
export function explicarMigracionesTocadas(tocadas, { permitidas = new Set(), aplicadas = null, invalidas = [] } = {}) {
  if (tocadas === null) {
    return { bloquea: false, texto: '⚠ verify-db-schema: no se pudo leer origin/main para comprobar que ninguna migración ya mergeada se editó, borró ni renombró (corre `git fetch origin main`)' }
  }
  const pedida = f => { const v = versionDeMigracion(f); return v !== null && permitidas.has(v) }
  const editadas = tocadas.editadas.filter(f => !pedida(f))
  const borradas = tocadas.borradas.filter(f => !pedida(f))
  const pedidas = [...tocadas.editadas, ...tocadas.borradas].filter(pedida)
  const yaAplicadas = aplicadas === null ? [] : pedidas.filter(f => aplicadas.has(versionDeMigracion(f)))
  const sinConfirmar = aplicadas === null ? pedidas : []
  const eximidas = aplicadas === null ? [] : pedidas.filter(f => !aplicadas.has(versionDeMigracion(f)))
  const sinUso = [...permitidas].filter(v => !pedidas.some(f => versionDeMigracion(f) === v))
  const textos = []
  for (const v of invalidas) {
    textos.push(`⚠ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR}: "${v}" no es una versión (14 dígitos, como 20261027180000); se ignora`)
  }
  for (const v of sinUso) {
    textos.push(`⚠ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR}: ${v} no coincide con ninguna migración de main que esta rama toque; se ignora`)
  }
  if (editadas.length > 0) {
    textos.push(`❌ verify-db-schema: esta rama edita migraciones que ya están en main (${editadas.join(', ')}): una migración mergeada ` +
      'no se edita (si prod ya la aplicó, no la vuelve a aplicar; si no, puede aplicarse la versión vieja): revierte la edición y ' +
      'pon el cambio en una migración NUEVA. Si no la editaste tú: `git fetch origin main`')
  }
  if (borradas.length > 0) {
    textos.push(`❌ verify-db-schema: esta rama borra o renombra migraciones que ya están en main (${borradas.join(', ')}): una migración ` +
      'mergeada no se borra ni renombra (supabase db push --include-all falla con "Remote migration versions not found" y frena las ' +
      'siguientes): restáurala con su nombre; si hay que deshacer su efecto, va en una migración NUEVA. Si no la tocaste tú: `git fetch origin main`')
  }
  for (const f of yaAplicadas) {
    textos.push(`❌ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR} no exime ${f}: prod YA aplicó ${versionDeMigracion(f)}: el cambio va en una migración NUEVA`)
  }
  for (const f of sinConfirmar) {
    textos.push(`❌ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR} no exime ${f}: no se pudo confirmar en prod que ${versionDeMigracion(f)} ` +
      'no está aplicada; corre el push con .env.local')
  }
  if (editadas.length + borradas.length > 0) {
    textos.push(`   Única salida, solo para una migración que FALLÓ al aplicarse y que prod NO registra en schema_migrations (el push lo ` +
      `comprueba con .env.local; si prod la registra, no hay salida): ${VARIABLE_PERMITIR_TOCAR}=<version> en la línea del push.`)
  }
  if (eximidas.length > 0) {
    textos.push(`⚠⚠ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR} exime ${eximidas.join(', ')} (prod no la registra como aplicada): ` +
      `solo para una migración que FALLÓ al aplicarse: ${TEXTO_CORRIDAS_PERMITIR_TOCAR}`)
  }
  return { bloquea: editadas.length + borradas.length + yaAplicadas.length + sinConfirmar.length > 0, texto: textos.join('\n') }
}

/**
 * Lo que corre verify-db-schema antes que nada: migraciones de main tocadas por la rama, con la salida de
 * `env.PERMITIR_TOCAR_MIGRACION`. Solo si la variable pide alguna de las tocadas se lee prod (`leerAplicadas`, que
 * devuelve el Set de versiones o null); sin credenciales esa lectura da null y la exención no procede.
 * La variable va SOLO en la línea del push: si `.env.local` (`envLocal`, su texto) la define, se ignora y se avisa,
 * porque ahí quedaría eximiendo todos los push siguientes sin que nadie lo note.
 *
 * Antes de comparar, `git fetch --quiet origin main` (el hook no hace fetch): contra un origin/main viejo, una
 * migración mergeada después sale como AGREGADA por la rama y su edición no se ve. Si el fetch falla, se avisa y se
 * compara contra la copia local; todo lo que verify compare después contra origin/main usa la ref ya actualizada.
 * Defensa extra: si la rama AGREGA una migración cuya versión prod ya registra (registro legible), bloquea.
 */
export async function revisarMigracionesTocadas({
  base = 'origin/main', git = gitPorDefecto, env = process.env, leerAplicadas = async () => null, envLocal = leerEnvLocal(),
} = {}) {
  let avisoFetch = ''
  try {
    git(['fetch', '--quiet', 'origin', 'main'])
  } catch {
    avisoFetch = '⚠ verify-db-schema: no se pudo actualizar origin/main; se comparó contra tu copia local'
  }
  const tocadas = migracionesTocadasEnLaRama({ base, git, enMain: migracionesEnMain({ base, git }) })
  const agregadas = migracionesAgregadasEnLaRama({ base, git })
  const desdeEnvLocal = new RegExp(`^\\s*(?:export\\s+)?${VARIABLE_PERMITIR_TOCAR}\\s*=`, 'm').test(envLocal)
  const valor = desdeEnvLocal ? '' : env[VARIABLE_PERMITIR_TOCAR]
  const permitidas = versionesPermitidas(valor)
  const invalidas = valoresInvalidosPermitir(valor)
  const pideAlguna = !!tocadas && [...tocadas.editadas, ...tocadas.borradas].some(f => permitidas.has(versionDeMigracion(f) ?? ''))
  const aplicadas = pideAlguna || agregadas.length > 0 ? await leerAplicadas() : null
  const avisoEnvLocal = desdeEnvLocal
    ? `⚠⚠ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR} está en .env.local y se ignora: sácala de ahí; va solo en la línea del push`
    : ''
  return unirRevisiones(
    { bloquea: false, texto: avisoFetch },
    { bloquea: false, texto: avisoEnvLocal },
    explicarMigracionesTocadas(tocadas, { permitidas, aplicadas, invalidas }),
    explicarAgregadasYaAplicadas(agregadas, aplicadas),
  )
}

/**
 * Migraciones que la rama AGREGA y cuya versión prod ya registra (solo con registro legible: con null no se sabe y no
 * se bloquea por esto). Es una mergeada que se editó y que el diff ve como nueva, o un choque de versión.
 */
export function explicarAgregadasYaAplicadas(agregadas, aplicadas) {
  const choques = aplicadas ? agregadas.filter(f => { const v = versionDeMigracion(f); return v !== null && aplicadas.has(v) }) : []
  return {
    bloquea: choques.length > 0,
    texto: choques.map(f => `❌ verify-db-schema: ${f}: prod ya registra ${versionDeMigracion(f)}: si es una migración ya mergeada ` +
      'que editaste, el cambio va en una NUEVA; si es un choque de versión, renombra la tuya').join('\n'),
  }
}

const unirRevisiones = (...rs) => ({ bloquea: rs.some(r => r.bloquea), texto: rs.map(r => r.texto).filter(Boolean).join('\n') })

function leerEnvLocal() {
  try {
    return fs.readFileSync('.env.local', 'utf8')
  } catch {
    return ''
  }
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

/**
 * Versiones que prod registra como aplicadas; null si la lectura falla o viene vacía (prod siempre tiene al menos la
 * baseline: cero filas es una lectura que no sirve, no "nada aplicado"). Con null nada que dependa de prod se exime:
 * ni la columna de una migración de la rama (sin_registro_rama), ni la de una de main (sin_registro).
 */
export async function migracionesAplicadasEnProd(execSql) {
  try {
    const filas = await execSql('select version from supabase_migrations.schema_migrations')
    if (!Array.isArray(filas) || filas.length === 0) return null
    return new Set(filas.map(f => String(f.version)))
  } catch {
    return null
  }
}

/**
 * `leerAplicadas` de revisarMigracionesTocadas: el registro de PROD o null. Con .env.local apuntando a otro proyecto
 * (una base de pruebas), su schema_migrations no dice nada de prod y no puede eximir ni bloquear por prod.
 */
export async function aplicadasSoloDeProd({ env = process.env, leer }) {
  if (projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL) !== PROD_REF) return null
  return leer()
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
      // Sin registro legible no se sabe si su versión ya está aplicada (editada tras aplicarla, o choca con otra).
      if (aplicadas === null) out.nuevas.push({ ...m, migracion: deRama, motivo: 'sin_registro_rama' })
      // Prod ya registra la versión de una migración que esta rama agrega: o se editó tras aplicarla, o la versión
      // choca con otra migración.
      else if (yaAplicada(deRama)) out.nuevas.push({ ...m, migracion: deRama, motivo: 'rama_aplicada' })
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
    case 'sin_registro_rama':
      return `la agrega ${m.migracion}, de esta rama, pero no se pudo leer supabase_migrations.schema_migrations de prod para ` +
        `comprobar que la versión ${versionDeMigracion(m.migracion)} no está ya aplicada: reintenta el push con .env.local`
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
