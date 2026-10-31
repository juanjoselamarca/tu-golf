/**
 * Migraciones de main que la rama edita, borra, renombra o repite. Lo usa verify-db-schema.mjs antes que nada (y el
 * atajo del pre-push con --solo-migraciones). Solo mira git: nada de acá lee una base.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { archivoPorVersion, esMigracionAplicable, PREFIJO_ETIQUETA, VERSION_CLI, versionDeMigracion } from './nombre-migracion.mjs'

export { versionDeMigracion }

const gitPorDefecto = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

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
const ETIQUETA_PERMITIR_TOCAR = `${PREFIJO_ETIQUETA}<version>`

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
 * Única salida, `PERMITIR_TOCAR_MIGRACION=<version>` (`permitidas`), para una migración que FALLÓ al aplicarse. Acá
 * exime sin comprobarlo, porque nada local lee prod: lo decide en el PR la etiqueta `permitir-tocar-migracion:<version>`
 * del check "Migraciones mergeadas intactas", que pone Juanjo tras confirmar que prod no la registra.
 */
export function explicarMigracionesTocadas(tocadas, { permitidas = new Set(), invalidas = [] } = {}) {
  if (tocadas === null) {
    return { bloquea: false, texto: '⚠ verify-db-schema: no se pudo leer origin/main para comprobar que ninguna migración ya mergeada se editó, borró ni renombró (corre `git fetch origin main`)' }
  }
  const pedida = f => { const v = versionDeMigracion(f); return v !== null && permitidas.has(v) }
  const distintasDeMain = tocadas.distintas ?? []
  const distintas = distintasDeMain.filter(f => !pedida(f))
  const editadas = tocadas.editadas.filter(f => !pedida(f))
  const borradas = tocadas.borradas.filter(f => !pedida(f))
  const pedidas = [...tocadas.editadas, ...tocadas.borradas, ...distintasDeMain].filter(pedida)
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
  for (const f of distintas) {
    textos.push(`❌ verify-db-schema: main ya trae ${f} con otro contenido: \`git merge origin/main\`; el cambio va en una migración NUEVA`)
  }
  if (borradas.length > 0) {
    textos.push(`❌ verify-db-schema: esta rama borra o renombra migraciones que ya están en main (${borradas.join(', ')}): una migración ` +
      'mergeada no se borra ni renombra (supabase db push --include-all falla con "Remote migration versions not found" y frena las ' +
      'siguientes): restáurala con su nombre; si hay que deshacer su efecto, va en una migración NUEVA. Si no la tocaste tú: `git fetch origin main`')
  }
  if (editadas.length + borradas.length + distintas.length > 0) {
    textos.push(`   Única salida, solo para una migración que FALLÓ al aplicarse y que prod NO registra en schema_migrations: ` +
      `${VARIABLE_PERMITIR_TOCAR}=<version> en la línea del push, y en el PR la etiqueta ${ETIQUETA_PERMITIR_TOCAR}, que pone Juanjo ` +
      'tras comprobarlo (si prod la registra, no hay salida).')
  }
  if (pedidas.length > 0) {
    textos.push(`⚠⚠ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR} exime ${pedidas.join(', ')} sin comprobar prod: en el PR lo decide ` +
      `la etiqueta ${ETIQUETA_PERMITIR_TOCAR}. Solo para una migración que FALLÓ al aplicarse: ${TEXTO_CORRIDAS_PERMITIR_TOCAR}`)
  }
  return { bloquea: editadas.length + borradas.length + distintas.length > 0, texto: textos.join('\n') }
}

/**
 * Lo que corre verify-db-schema antes que nada: migraciones de main tocadas por la rama, con la salida de
 * `env.PERMITIR_TOCAR_MIGRACION`.
 * La variable va SOLO en la línea del push: si `.env.local` (`envLocal`, su texto) la define, se ignora y se avisa,
 * porque ahí quedaría eximiendo todos los push siguientes sin que nadie lo note.
 *
 * Antes de comparar, `git fetch --quiet origin main` (el hook no hace fetch): contra un origin/main viejo, una
 * migración mergeada después sale como AGREGADA por la rama y su edición no se ve. Si el fetch falla, se avisa y se
 * compara contra la copia local; todo lo que verify compare después contra origin/main usa la ref ya actualizada.
 * Las AGREGADAS se reparten con agregadasQueYaEstanEnMain (por nombre y por versión contra main).
 */
export function revisarMigracionesTocadas({
  base = 'origin/main', git = gitPorDefecto, env = process.env, envLocal = leerEnvLocal(),
} = {}) {
  let avisoFetch = ''
  try {
    git(['fetch', '--quiet', 'origin', 'main'])
  } catch {
    avisoFetch = '⚠ verify-db-schema: no se pudo actualizar origin/main; se comparó contra tu copia local'
  }
  const enMain = migracionesEnMain({ base, git })
  const tocadasEnMain = migracionesTocadasEnLaRama({ base, git, enMain })
  const agregadas = migracionesAgregadasEnLaRama({ base, git })
  const { iguales, distintas, versionEnMain } = agregadasQueYaEstanEnMain(agregadas, { enMain, base, git })
  const tocadas = tocadasEnMain && { ...tocadasEnMain, distintas }
  const desdeEnvLocal = new RegExp(`^\\s*(?:export\\s+)?${VARIABLE_PERMITIR_TOCAR}\\s*=`, 'm').test(envLocal)
  const valor = desdeEnvLocal ? '' : env[VARIABLE_PERMITIR_TOCAR]
  const permitidas = versionesPermitidas(valor)
  const invalidas = valoresInvalidosPermitir(valor)
  const avisoEnvLocal = desdeEnvLocal
    ? `⚠⚠ verify-db-schema: ${VARIABLE_PERMITIR_TOCAR} está en .env.local y se ignora: sácala de ahí; va solo en la línea del push`
    : ''
  return unirRevisiones(
    { bloquea: false, texto: avisoFetch },
    { bloquea: false, texto: avisoEnvLocal },
    {
      bloquea: false,
      texto: iguales.map(f => `⚠ verify-db-schema: main ya trae ${f} (llegó por squash); haz \`git merge origin/main\``).join('\n'),
    },
    {
      bloquea: versionEnMain.length > 0,
      texto: versionEnMain.map(({ archivo, enMain: g, version }) => `❌ verify-db-schema: ${archivo}: main ya trae la versión ${version} ` +
        `como ${g}: si es tu migración renombrada, \`git merge origin/main\`, deja ${g} como está y el cambio va en una NUEVA; ` +
        'si es otra, renombra la tuya con un timestamp nuevo').join('\n'),
    },
    explicarMigracionesTocadas(tocadas, { permitidas, invalidas }),
  )
}

/**
 * Reparte las migraciones que el diff ve como AGREGADAS por la rama. "Está en main" se decide acá y solo acá:
 * - Mismo NOMBRE en main (típico tras un merge squash: la rama conserva los commits originales sin haber mergeado
 *   main): se compara el blob de `base:<f>` con el de `HEAD:<f>`. Igual = `iguales` (solo aviso). Distinto, o git
 *   falla = `distintas` (edición de una migración mergeada: bloquea como una editada).
 * - Nombre que no está en main pero VERSIÓN que sí (`versionEnMain`, con el archivo de main): un renombre de una que
 *   llegó por squash, o un choque. Bloquea siempre, sin salida.
 * - El resto (ni el nombre ni la versión están en main) es una migración nueva y no se reporta.
 */
export function agregadasQueYaEstanEnMain(agregadas, { enMain, base = 'origin/main', git = gitPorDefecto }) {
  const out = { iguales: [], distintas: [], versionEnMain: [] }
  const porVersion = archivoPorVersion(enMain ?? [])
  for (const f of agregadas) {
    if (!enMain?.has(f)) {
      const version = versionDeMigracion(f)
      if (version !== null && porVersion.has(version)) out.versionEnMain.push({ archivo: f, enMain: porVersion.get(version), version })
      continue
    }
    let igual = false
    try {
      igual = git(['rev-parse', `${base}:${f}`]).trim() === git(['rev-parse', `HEAD:${f}`]).trim()
    } catch {
      igual = false
    }
    out[igual ? 'iguales' : 'distintas'].push(f)
  }
  return out
}

function unirRevisiones(...rs) {
  return { bloquea: rs.some(r => r.bloquea), texto: rs.map(r => r.texto).filter(Boolean).join('\n') }
}

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
