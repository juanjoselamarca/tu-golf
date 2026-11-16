/**
 * Tendencia y front/back de /perfil/stats. Los agregados (conteo hoyo a hoyo,
 * promedios, mejores rondas) viven en rondas-normalizadas.ts, fuente única
 * compartida con /perfil/historial.
 *
 * Regla fundamental: NUNCA comparar rondas por gross absoluto.
 * Siempre usar vsPar (diferencial contra par) para comparar rendimiento.
 */

import { vsPar } from '../core/compare'
import type { RoundForCompare } from '../core/compare'
import { inferHoles, type HoleCount } from '../core/holes'

export type { RoundForCompare }

/**
 * Input mínimo para las funciones de bucket por hole count.
 * `scores` como number[] satisface tanto inferHoles como vsPar.
 */
export interface BucketRound extends RoundForCompare {
  scores?: number[] | null
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
