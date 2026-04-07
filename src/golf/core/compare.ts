/**
 * Comparación de rondas — normaliza 9 vs 18 hoyos usando vsPar.
 * Resuelve el bug donde rondas de 9 hoyos parecían "mejores" por tener gross menor.
 */

export interface RoundForCompare {
  total_gross: number
  holes_played?: number | null
  par_total?: number | null
  scores?: (number | null)[] | null
  vsPar?: number | null
}

/**
 * Calcula score vs par de una ronda.
 * Si la ronda ya tiene vsPar calculado, lo usa.
 * Si no, infiere el par según la cantidad de hoyos.
 */
export function vsPar(round: RoundForCompare): number {
  if (round.vsPar != null) return round.vsPar
  const holes = round.holes_played ?? (round.scores?.length ?? 18)
  const par = round.par_total ?? (holes <= 9 ? 36 : 72)
  return round.total_gross - par
}

/**
 * Encuentra la mejor ronda por vsPar (menor diferencial = mejor).
 */
export function bestRoundByVsPar<T extends RoundForCompare>(rounds: T[]): T | null {
  if (rounds.length === 0) return null
  return rounds.reduce((best, r) => vsPar(r) < vsPar(best) ? r : best)
}

/**
 * Ordena rondas por rendimiento (mejor primero = menor vsPar).
 */
export function sortRoundsByPerformance<T extends RoundForCompare>(rounds: T[]): T[] {
  return [...rounds].sort((a, b) => vsPar(a) - vsPar(b))
}

/**
 * Top N rondas por rendimiento.
 */
export function topRoundsByPerformance<T extends RoundForCompare>(rounds: T[], n: number): T[] {
  return sortRoundsByPerformance(rounds).slice(0, n)
}

/**
 * Separa rondas en 18 hoyos y 9 hoyos.
 */
export function splitByHoles<T extends RoundForCompare>(rounds: T[]): { rounds18: T[]; rounds9: T[] } {
  const rounds18: T[] = []
  const rounds9: T[] = []
  for (const r of rounds) {
    const holes = r.holes_played ?? (r.scores?.length ?? 18)
    if (holes >= 18) rounds18.push(r)
    else rounds9.push(r)
  }
  return { rounds18, rounds9 }
}

/**
 * Cuenta birdies, eagles, pars, bogeys y dobles usando par REAL por hoyo.
 * Reemplaza la lógica buggy que asumía par 4 para todos los hoyos.
 */
export function countByResult(
  scores: (number | null)[],
  holePars: number[]
): { albatros: number; eagles: number; birdies: number; pars: number; bogeys: number; doubles: number } {
  let albatros = 0, eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]
    const par = holePars[i] ?? 4
    if (s == null || s === 0) continue
    const diff = s - par
    if (diff <= -3) albatros++
    else if (diff === -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pars++
    else if (diff === 1) bogeys++
    else doubles++
  }
  return { albatros, eagles, birdies, pars, bogeys, doubles }
}
