/**
 * Project ref de Supabase a partir de la URL pública (`https://<ref>.supabase.co`).
 * Fuente única: la usan run-sql, verify-db-schema, audit-handicap-calc, el monitor de caídas, el
 * respaldo y scripts/test-db.
 * → el ref en minúsculas (un ref en mayúsculas no puede esquivar esProd() de management-sql), o null si la URL no
 * tiene el formato esperado.
 */
/** Ref del proyecto de PRODUCCIÓN. Lo usa management-sql.mjs para forzar read_only contra prod aunque falte el env. */
export const PROD_REF = 'hoswfwhvcgqlqdmzpnce'

/** Env vars that can reach a Supabase project. Unit tests delete them; con-base-de-pruebas.mjs repoints the ones the tests read and drops the rest. */
export const SUPABASE_CREDENTIAL_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'EVENTO_SUPABASE_URL',
  'EVENTO_SUPABASE_KEY',
]

export function projectRefDe(url) {
  const m = String(url ?? '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)
  return m ? m[1].toLowerCase() : null
}
