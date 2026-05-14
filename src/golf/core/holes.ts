/**
 * Inferencia de hole count para rondas históricas.
 *
 * `historical_rounds.holes_played` es null en ~68% de las rondas (datos viejos
 * sin la columna populated). Para no contaminar agregados (avg score, promedio
 * por cancha, tendencias) con la mezcla de 9h/18h, este helper infiere el
 * hole count desde el campo `scores` cuando `holes_played` está ausente.
 *
 * Returns:
 *   9 | 18 si se puede determinar con confianza
 *   null si no hay data suficiente (scores no es array reconocible)
 *
 * NUNCA promediar entre buckets — ese es el bug que este módulo previene.
 */
export type HoleCount = 9 | 18

export type HoleCountInput = {
  holes_played?: number | null
  scores?: number[] | Record<string, number> | null
}

export function inferHoles(r: HoleCountInput): HoleCount | null {
  if (r.holes_played === 9 || r.holes_played === 18) return r.holes_played
  if (Array.isArray(r.scores)) {
    if (r.scores.length === 9) return 9
    if (r.scores.length === 18) return 18
    return null
  }
  if (r.scores && typeof r.scores === 'object') {
    const n = Object.keys(r.scores).length
    if (n === 9) return 9
    if (n === 18) return 18
  }
  return null
}
