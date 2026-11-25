import { esCodigoTransitorio } from './codigos-postgrest'

/**
 * Una lectura de PostgREST que volvió con `error`, para los llamadores que eligen fallar CERRADO (`lanzarSiFalla`).
 *
 * Separa las dos clases de fallo que importan para decidir si reintentar:
 * - **de señal**: el error no trae `code`. Así responde `postgrest-js` (2.116, `PostgrestBuilder.then`) cuando el
 *   fetch se cae, se aborta o vence: NO lanza, devuelve `{ error: { message: 'TypeError: …', code: '' }, status: 0 }`.
 *   Lo mismo un 502/520/522 del gateway con cuerpo HTML. Releer puede arreglarlo. También lo es el que trae un `code`
 *   transitorio (`esCodigoTransitorio`: 57014 statement timeout, PGRST000-003, clase 08, 53, 57P, 40001): la base
 *   lenta del 04-oct-2026 contestaba así.
 * - **permanente**: el resto de los `code` (42501 permisos, 42703 columna inexistente, PGRST1xx petición mal armada).
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

  /** ¿Falló la red o la base no pudo contestar a tiempo (reintentable), y no la consulta? */
  get deSenal(): boolean {
    return this.codigo == null || esCodigoTransitorio(this.codigo)
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

/**
 * Lo que se reporta de un fallo de lectura: el `code` de PostgREST y el mensaje técnico. `captureError` no guarda
 * `cause`, así que quien envuelve una `LecturaFallidaError` (p. ej. `FalloDelContextoSkins`, que lleva el mensaje
 * para el jugador) pierde el 42501 si no lo pasa en `meta`. Recorre la cadena de `cause`.
 */
export function detalleDeLecturaFallida(err: unknown): { codigo: string | null; causa: string | null } {
  let actual: unknown = err
  for (let i = 0; i < 5 && actual != null; i++) {
    if (actual instanceof LecturaFallidaError) return { codigo: actual.codigo, causa: actual.message }
    actual = (actual as { cause?: unknown }).cause
  }
  const ultimo = err instanceof Error && err.cause instanceof Error ? err.cause : err
  return { codigo: null, causa: ultimo instanceof Error ? `${ultimo.name}: ${ultimo.message}` : null }
}
