// src/lib/mi-golf/par.ts

import { parForRound, type ParPerHoleInput } from '@/golf/core/holes'

/**
 * Par de la ronda según los hoyos jugados.
 *
 * Fuente única de "par de esta ronda". Usa el par REAL de la cancha cuando se
 * entrega `parPerHole` (vía `parForRound`); si no hay datos por hoyo, cae al
 * estimado 9→36 / 18→72.
 *
 * El estimado es un trade-off de precisión por costo de datos: pantallas que
 * listan muchas rondas (dashboard/stats) no traen `par_per_hole` a propósito
 * (query SLIM, perf), así que usan el estimado. Superficies de UNA ronda
 * (tarjeta OG) sí lo traen y obtienen el par exacto. Mismo concepto, una
 * función; cada caller decide según su costo de datos.
 */
export function getParForHoles(
  holes_played: number | null | undefined,
  parPerHole?: ParPerHoleInput,
): number {
  const real = parForRound(parPerHole, holes_played)
  if (real != null) return real
  if (holes_played == null) return 72
  return holes_played <= 9 ? 36 : 72
}

/**
 * Calcula gross vs par de forma consciente de 9 vs 18 hoyos.
 * Retorna null si no hay total_gross. Con `parPerHole` usa el par real.
 */
export function getVsPar(
  total_gross: number | null,
  holes_played: number | null | undefined,
  parPerHole?: ParPerHoleInput,
): number | null {
  if (total_gross == null) return null
  return total_gross - getParForHoles(holes_played, parPerHole)
}
