/**
 * Una lectura de PostgREST que volvió con `error`, para los llamadores que eligen fallar CERRADO (`lanzarSiFalla`).
 *
 * Separa las dos clases de fallo que importan para decidir si reintentar:
 * - **de señal**: el error no trae `code`. Así responde `postgrest-js` (2.116, `PostgrestBuilder.then`) cuando el
 *   fetch se cae, se aborta o vence: NO lanza, devuelve `{ error: { message: 'TypeError: …', code: '' }, status: 0 }`.
 *   Lo mismo un 5xx del gateway sin cuerpo JSON. Releer puede arreglarlo.
 * - **permanente**: el error trae `code` (42501 permisos, 42703 columna inexistente, PGRST1xx petición mal armada).
 *   Releer repite la falla.
 */
export class LecturaFallidaError extends Error {
  /** Código de PostgREST/Postgres; `null` si la respuesta no trajo uno (fallo de red). */
  readonly codigo: string | null

  constructor(message: string, codigo: string | null | undefined) {
    super(message)
    this.name = 'LecturaFallidaError'
    this.codigo = codigo ? codigo : null
  }

  /** ¿Falló la red (reintentable) y no la consulta? */
  get deSenal(): boolean {
    return this.codigo == null
  }
}

/** El `error` de una respuesta de PostgREST, lo mínimo que se lee de él. */
export interface ErrorDePostgrest {
  message?: string
  code?: string | null
}

/** Lanza `LecturaFallidaError` si la respuesta trae `error`; si no, no hace nada. */
export function lanzarSiLecturaFallo(error: ErrorDePostgrest | null | undefined, que: string): void {
  if (!error) return
  throw new LecturaFallidaError(`No se pudo leer ${que}: ${error.message ?? 'error desconocido'}`, error.code)
}
