/**
 * Project ref de Supabase a partir de la URL pública (`https://<ref>.supabase.co`).
 * Fuente única: la usan run-sql, verify-db-schema, audit-handicap-calc, el monitor de caídas y el
 * proxy SQL de los agentes nocturnos (que la re-exporta como projectRefFromUrl).
 * → el ref, o null si la URL no tiene el formato esperado.
 */
export function projectRefDe(url) {
  const m = String(url ?? '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)
  return m ? m[1] : null
}
