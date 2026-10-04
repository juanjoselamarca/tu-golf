/**
 * Tope de filas por respuesta de PostgREST en Supabase (`db-max-rows`). Corta en
 * silencio: una respuesta con exactamente este número de filas PUEDE estar
 * truncada, y `.range()`/`.limit()` mayores no lo levantan.
 */
export const MAX_FILAS_POSTGREST = 1000
