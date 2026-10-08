// Copy de "cuán fresco es el dato" de las vistas en vivo (polling sin Realtime).
// Fuente única: el espectador de ronda libre y el leaderboard del scorer.

/**
 * Antigüedad del dato mostrado, en segundos, a partir de cuándo llegó y del
 * header `Age` del CDN (lo que la respuesta llevaba guardada). Sin depender del
 * reloj del servidor: llegadaMs y ahoraMs son del mismo reloj (el del teléfono).
 */
export function segundosDesdeElDato(llegadaMs: number | null, edadAlLlegarS: number, ahoraMs: number): number {
  if (llegadaMs == null || ahoraMs <= 0) return 0
  return Math.max(0, Math.floor((ahoraMs - llegadaMs) / 1000) + Math.max(0, edadAlLlegarS))
}

/** "Justo ahora" · "Actualizado hace 12s" · "Actualizado hace 2m". */
export function textoActualizadoHace(segundos: number): string {
  if (segundos < 5) return 'Justo ahora'
  if (segundos < 60) return `Actualizado hace ${segundos}s`
  return `Actualizado hace ${Math.floor(segundos / 60)}m`
}
