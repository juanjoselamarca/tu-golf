/**
 * Nombre de una migración, como lo lee la CLI de Supabase: `supabase db push` toma como versión los dígitos antes
 * del primer `_` (`<yyyyMMddHHmmss>_<nombre>.sql`, lo que genera `supabase migration new`). Fuente única para el
 * canario de nombres (src/__tests__/canary-migration-names.test.ts) y para verify-db-schema.
 */
export const NOMBRE_MIGRACION_CLI = /^(\d{14})_.+\.sql$/

/** Versión de una migración (acepta la ruta): `supabase/migrations/20261027180000_x.sql` → `20261027180000`; null si el nombre no la tiene. */
export const versionDeMigracion = archivo => NOMBRE_MIGRACION_CLI.exec(archivo.split(/[\\/]/).pop() ?? '')?.[1] ?? null
