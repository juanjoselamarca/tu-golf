/**
 * ¿El error de `supabase.auth.getUser()` (servidor) es una falla pasajera de Auth y no
 * "no hay sesión"?
 *
 * Sin esta distinción, una API que hace `if (!user) return 401` le contesta "inicia sesión" a un
 * jugador con sesión válida mientras Auth está caído o lento (04-oct-2026: Auth respondió 5xx
 * ~1 h). El cliente lee el 401 como "tu sesión se cerró" y deja de reintentar; con un 503 sigue
 * reintentando solo.
 *
 * - Pasajero: `AuthRetryableFetchError` (red, timeout, 502/503/504 del gateway), cualquier 5xx y
 *   status 0 (la respuesta nunca llegó).
 * - No pasajero: sin cookie (`AuthSessionMissingError`, 400), JWT vencido o inválido (401/403).
 */
export function esFalloTransitorioDeAuth(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: unknown; status?: unknown }
  if (e.name === 'AuthRetryableFetchError') return true
  return typeof e.status === 'number' && (e.status === 0 || e.status >= 500)
}
