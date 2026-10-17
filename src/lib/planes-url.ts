/**
 * Link a /planes que recuerda de dónde viene el usuario — FUENTE ÚNICA.
 *
 * Se llega a /planes desde el medio de un flujo (armar una ronda, el asistente de
 * torneo, el panel de la ronda en vivo). Su "Volver" iba siempre al dashboard: el
 * jugador perdía el lugar donde estaba. Cada link a /planes se arma con
 * `planesUrl(rutaActual)` y /planes vuelve con `destinoDeVolverDePlanes`.
 *
 * `volver` viaja en la URL: se valida con `sanitizeNext` (solo rutas internas,
 * mismo criterio anti open-redirect que el login).
 */
import { DEFAULT_NEXT, sanitizeNext } from '@/lib/auth/login-url'

export const RUTA_PLANES = '/planes'

export function planesUrl(volver?: string | null): string {
  if (!volver) return RUTA_PLANES
  const destino = sanitizeNext(volver)
  if (destino === DEFAULT_NEXT || destino.startsWith(RUTA_PLANES)) return RUTA_PLANES
  return `${RUTA_PLANES}?volver=${encodeURIComponent(destino)}`
}

/** A dónde lleva "Volver" en /planes: la ruta de origen si es interna; si no, el dashboard. */
export function destinoDeVolverDePlanes(volver: string | null | undefined): string {
  const destino = sanitizeNext(volver)
  return destino.startsWith(RUTA_PLANES) ? DEFAULT_NEXT : destino
}
