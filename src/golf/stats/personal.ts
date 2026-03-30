/**
 * Estadísticas personales centralizadas.
 * Reemplaza lógica duplicada y buggy de stats/page.tsx y historial/page.tsx.
 *
 * Regla fundamental: NUNCA comparar rondas por gross absoluto.
 * Siempre usar vsPar (diferencial contra par) para comparar rendimiento.
 */

import { vsPar, bestRoundByVsPar, sortRoundsByPerformance, splitByHoles, countByResult } from '../core/compare'
import type { RoundForCompare } from '../core/compare'

export type { RoundForCompare }

export interface PersonalStats {
  totalRounds: number
  totalRounds18: number
  totalRounds9: number
  avgOverPar18: number | null
  avgOverPar9: number | null
  bestRound18: { score: number; vsPar: number; course: string; date: string } | null
  bestRound9: { score: number; vsPar: number; course: string; date: string } | null
  topRounds: Array<RoundWithMeta & { computedVsPar: number }>
  totalEagles: number
  totalBirdies: number
  totalPars: number
  totalBogeys: number
  totalDoubles: number
}

interface RoundWithMeta extends RoundForCompare {
  course_name?: string
  played_at?: string
  hole_pars?: number[] | null
}

/**
 * Calcula stats personales completas usando vsPar (no gross).
 * Separa 9 y 18 hoyos automáticamente.
 */
export function calcPersonalStats(rounds: RoundWithMeta[]): PersonalStats {
  const { rounds18, rounds9 } = splitByHoles(rounds)

  // Best rounds by vsPar
  const best18 = bestRoundByVsPar(rounds18)
  const best9 = bestRoundByVsPar(rounds9)

  // Avg over par
  const avgOverPar18 = rounds18.length > 0
    ? rounds18.reduce((sum, r) => sum + vsPar(r), 0) / rounds18.length
    : null
  const avgOverPar9 = rounds9.length > 0
    ? rounds9.reduce((sum, r) => sum + vsPar(r), 0) / rounds9.length
    : null

  // Top 5 rounds (all, by vsPar)
  const topRounds = sortRoundsByPerformance(rounds)
    .slice(0, 5)
    .map(r => ({ ...r, computedVsPar: vsPar(r) }))

  // Count results usando par real por hoyo
  let totalEagles = 0, totalBirdies = 0, totalPars = 0, totalBogeys = 0, totalDoubles = 0
  for (const r of rounds) {
    const scores = r.scores
    if (!scores || !Array.isArray(scores)) continue
    const pars = r.hole_pars ?? defaultPars(scores.length)
    const counts = countByResult(scores, pars)
    totalEagles += counts.eagles
    totalBirdies += counts.birdies
    totalPars += counts.pars
    totalBogeys += counts.bogeys
    totalDoubles += counts.doubles
  }

  return {
    totalRounds: rounds.length,
    totalRounds18: rounds18.length,
    totalRounds9: rounds9.length,
    avgOverPar18: avgOverPar18 != null ? Math.round(avgOverPar18 * 10) / 10 : null,
    avgOverPar9: avgOverPar9 != null ? Math.round(avgOverPar9 * 10) / 10 : null,
    bestRound18: best18 ? {
      score: best18.total_gross,
      vsPar: vsPar(best18),
      course: best18.course_name ?? '',
      date: best18.played_at ?? '',
    } : null,
    bestRound9: best9 ? {
      score: best9.total_gross,
      vsPar: vsPar(best9),
      course: best9.course_name ?? '',
      date: best9.played_at ?? '',
    } : null,
    topRounds,
    totalEagles, totalBirdies, totalPars, totalBogeys, totalDoubles,
  }
}

/** Genera array de pars default cuando no hay datos reales del campo. */
function defaultPars(holesPlayed: number): number[] {
  // Par standard: 4 por hoyo como fallback razonable
  return Array(holesPlayed).fill(4)
}
