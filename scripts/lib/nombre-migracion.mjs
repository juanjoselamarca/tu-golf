/**
 * Nombre de una migración, como lo lee la CLI de Supabase: `supabase db push` toma como versión los dígitos antes
 * del primer `_` (`<yyyyMMddHHmmss>_<nombre>.sql`, lo que genera `supabase migration new`). Fuente única para el
 * canario de nombres (src/__tests__/canary-migration-names.test.ts) y para verify-db-schema.
 */
const DIGITOS_VERSION = '\\d{14}'
export const NOMBRE_MIGRACION_CLI = new RegExp(`^(${DIGITOS_VERSION})_.+\\.sql$`)

/** Una versión sola (`20261027180000`), como la escribe quien usa PERMITIR_TOCAR_MIGRACION. Misma fuente de dígitos. */
export const VERSION_CLI = new RegExp(`^${DIGITOS_VERSION}$`)

/**
 * Archivo que la CLI aplica como migración: un `.sql` DIRECTO en `supabase/migrations/` (la CLI no entra a subcarpetas:
 * `rollback/` y cualquier otra quedan fuera). La ruta se normaliza a `/`.
 */
export const esMigracionAplicable = archivo => /(^|\/)supabase\/migrations\/[^/]+\.sql$/.test(archivo.replace(/\\/g, '/'))

/** Versión de una migración (acepta la ruta): `supabase/migrations/20261027180000_x.sql` → `20261027180000`; null si el nombre no la tiene. */
export const versionDeMigracion = archivo => NOMBRE_MIGRACION_CLI.exec(archivo.split(/[\\/]/).pop() ?? '')?.[1] ?? null

/** Map versión → archivo (el primero con esa versión; los que no tienen versión se omiten). Fuente única de "qué archivo usa la versión V". */
export function archivoPorVersion(archivos) {
  const out = new Map()
  for (const f of archivos) {
    const v = versionDeMigracion(f)
    if (v !== null && !out.has(v)) out.set(v, f)
  }
  return out
}

/**
 * Un error por cada archivo que repite la versión de otro del mismo árbol (el primero por orden queda como dueño):
 * `supabase db push` aplica el primero y falla en el segundo. Fuente única del canario de nombres y del check de CI.
 */
export function versionesRepetidas(archivos) {
  const duenio = archivoPorVersion(archivos)
  return archivos
    .filter(f => { const v = versionDeMigracion(f); return v !== null && duenio.get(v) !== f })
    .map(f => `❌ ${f} repite la versión ${versionDeMigracion(f)} de ${duenio.get(versionDeMigracion(f))}: ` +
      '`supabase db push` aplicaría una sola. Renombra la que no se aplicó con un timestamp nuevo.')
}

/**
 * Etiqueta de salida del check de migraciones mergeadas intactas (`permitir-tocar-migracion:<version>`). La lee
 * scripts/ci/migraciones-inmutables.mjs. Es convención: la pone solo Juanjo y hoy nada detecta quién la pone (PR #673).
 */
export const PREFIJO_ETIQUETA = 'permitir-tocar-migracion:'
