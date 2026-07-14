/**
 * Estadísticas personales centralizadas.
 * Reemplaza lógica duplicada y buggy de stats/page.tsx y historial/page.tsx.
 *
 * Regla fundamental: NUNCA comparar rondas por gross absoluto.
 * Siempre usar vsPar (diferencial contra par) para comparar rendimiento.
 */

import { vsPar, bestRoundByVsPar, sortRoundsByPerformance, splitByHoles, countByResult } from '../core/compare'
import type { RoundForCompare } from '../core/compare'
import { inferHoles, type HoleCount } from '../core/holes'

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

export interface RoundWithMeta extends RoundForCompare {
  course_name?: string
  played_at?: string
  hole_pars?: number[] | null
}

export interface ScoringCounts {
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doubles: number
}

/**
 * Agrega el conteo de resultados (eagle/birdie/par/bogey/doble+) de un set de
 * rondas usando par REAL por hoyo (`hole_pars`), con fallback a par 4.
 *
 * Fuente ÚNICA de este concepto — la consumen calcPersonalStats y las
 * pantallas de stats (antes stats/page.tsx tenía su propia copia inline).
 * Nota: los albatros de countByResult no se suman a eagles (comportamiento
 * histórico de ambas copias; se mantiene).
 */
export function aggregateScoringCounts(rounds: RoundWithMeta[]): ScoringCounts {
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (const r of rounds) {
    const scores = r.scores
    if (!scores || !Array.isArray(scores)) continue
    const pars_ = r.hole_pars ?? defaultPars(scores.length)
    const counts = countByResult(scores, pars_)
    eagles += counts.eagles
    birdies += counts.birdies
    pars += counts.pars
    bogeys += counts.bogeys
    doubles += counts.doubles
  }
  return { eagles, birdies, pars, bogeys, doubles }
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

  // Count results usando par real por hoyo (fuente única: aggregateScoringCounts)
  const counts = aggregateScoringCounts(rounds)
  const { eagles: totalEagles, birdies: totalBirdies, pars: totalPars, bogeys: totalBogeys, doubles: totalDoubles } = counts

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

/**
 * Input mínimo para las funciones de bucket por hole count.
 * `scores` como number[] satisface tanto inferHoles como vsPar.
 */
export interface BucketRound extends RoundForCompare {
  scores?: number[] | null
}

export interface AvgScoreBucket {
  avg: number
  holes: HoleCount
  count: number
}

/**
 * Promedio de gross filtrado a UN solo bucket de hoyos (9 o 18).
 * Mezclar 9h con 18h en un promedio bruto produce un número engañoso
 * (un 45 de 9h con un 90 de 18h NO promedian a 67.5).
 *
 * Elige el bucket con más rondas (empate → 18h). Rondas con hole count
 * no inferible (inferHoles null) quedan fuera de ambos buckets.
 * Devuelve null si no hay rondas clasificables.
 */
export function avgScoreBucket(rounds: BucketRound[]): AvgScoreBucket | null {
  const rondas18 = rounds.filter((r) => inferHoles(r) === 18)
  const rondas9 = rounds.filter((r) => inferHoles(r) === 9)
  const bucket = rondas18.length >= rondas9.length ? rondas18 : rondas9
  if (bucket.length === 0) return null
  const avg = bucket.reduce((s, r) => s + r.total_gross, 0) / bucket.length
  return { avg, holes: bucket === rondas18 ? 18 : 9, count: bucket.length }
}

export interface ScoringTrend {
  avgLast: string
  avgPrev: string
  diff: string
  improving: boolean
  declining: boolean
  stable: boolean
  prevCount: number
  bucketHoles: HoleCount
}

/**
 * Tendencia de scoring: últimas 5 rondas vs las 5 anteriores, comparadas por
 * vsPar. Filtra a un solo bucket de hoyos antes de promediar (mezclar 9h con
 * 18h contamina el promedio). Preferencia: 18h con 10+ rondas → 9h con 10+ →
 * el bucket más poblado. Devuelve null si no hay data suficiente.
 */
export function scoringTrendLast5(allRounds: BucketRound[]): ScoringTrend | null {
  if (allRounds.length < 5) return null
  const rondas18 = allRounds.filter((r) => inferHoles(r) === 18)
  const rondas9 = allRounds.filter((r) => inferHoles(r) === 9)
  const bucket = rondas18.length >= 10 ? rondas18
    : rondas9.length >= 10 ? rondas9
    : rondas18.length >= rondas9.length ? rondas18
    : rondas9
  if (bucket.length < 5) return null
  const last5 = bucket.slice(-5)
  const prev5 = bucket.slice(-10, -5)
  if (prev5.length === 0) return null
  const avgLastVsPar = last5.reduce((s, r) => s + vsPar(r), 0) / last5.length
  const avgPrevVsPar = prev5.reduce((s, r) => s + vsPar(r), 0) / prev5.length
  const diff = avgLastVsPar - avgPrevVsPar
  return {
    avgLast: (last5.reduce((s, r) => s + r.total_gross, 0) / last5.length).toFixed(1),
    avgPrev: (prev5.reduce((s, r) => s + r.total_gross, 0) / prev5.length).toFixed(1),
    diff: diff.toFixed(1),
    improving: diff < -0.5,
    declining: diff > 0.5,
    stable: Math.abs(diff) <= 0.5,
    prevCount: prev5.length,
    bucketHoles: bucket === rondas18 ? 18 : 9,
  }
}

export interface FrontBackNine {
  front: string
  back: string
  count: number
}

/**
 * Promedio de golpes Front 9 vs Back 9 sobre rondas de 18 hoyos.
 * Requiere 3+ rondas elegibles (scores con 18+ hoyos); si no, null.
 */
export function frontBackNine(rounds: { scores?: number[] | null }[]): FrontBackNine | null {
  const eligible = rounds.filter((r) => r.scores && Array.isArray(r.scores) && r.scores.length >= 18)
  if (eligible.length < 3) return null
  let front = 0, back = 0
  for (const r of eligible) {
    front += r.scores!.slice(0, 9).reduce((a: number, b: number) => a + (b ?? 0), 0)
    back += r.scores!.slice(9, 18).reduce((a: number, b: number) => a + (b ?? 0), 0)
  }
  return {
    front: (front / eligible.length).toFixed(1),
    back: (back / eligible.length).toFixed(1),
    count: eligible.length,
  }
}

/**
 * Golf Wellness Index (GWI de perfil/stats — NO confundir con el Golf Win
 * Index de gwi.ts, que es probabilidad de ganar en vivo).
 *
 * Escala 0-100 desde el promedio de score: 62 → 100, cada golpe resta 5.
 * Fórmula histórica de stats/page.tsx, ahora con fuente única y nombre.
 * NOTA: calibrada para promedios de 18 hoyos — con bucket de 9h satura en 100
 * (comportamiento heredado; si se recalibra, se hace acá y en un solo lugar).
 */
export function golfWellnessIndex(avgScore: number): number {
  return Math.max(0, Math.min(100, 100 - ((avgScore - 62) * 5)))
}
