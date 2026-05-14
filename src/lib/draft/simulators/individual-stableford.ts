// src/lib/draft/simulators/individual-stableford.ts
//
// Simulador para Stableford individual. Genera scores stroke realistas y
// luego los convierte a puntos según `stableford_config.points_table`.
// Defaults USGA: albatross+=5, eagle=4, birdie=3, par=2, bogey=1, double+=0.
// Asume par=4 por hoyo (consistente con stroke simulator).
import type { TournamentConfig } from '../types'
import {
  DEMO_NAMES,
  type SimulatedStablefordPlayer,
  type SimulatedStablefordResult,
  getCategoryIdForIndex,
  getHoleCount,
  makeRng,
  randomStrokeScore,
} from './_shared'

export interface StablefordPointsTable {
  albatross_or_better: number
  eagle: number
  birdie: number
  par: number
  bogey: number
  double_or_worse: number
}

const DEFAULT_POINTS_TABLE: StablefordPointsTable = {
  albatross_or_better: 5,
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  double_or_worse: 0,
}

export function scoreToStablefordPoints(
  score: number,
  par: number,
  table: StablefordPointsTable,
): number {
  const diff = score - par
  if (diff <= -3) return table.albatross_or_better
  if (diff === -2) return table.eagle
  if (diff === -1) return table.birdie
  if (diff === 0) return table.par
  if (diff === 1) return table.bogey
  return table.double_or_worse // diff >= 2
}

export function simulateIndividualStableford(
  config: TournamentConfig,
  seed?: number,
): SimulatedStablefordResult {
  const rng = makeRng(seed)
  const holeCount = getHoleCount(config)
  const table = config.stableford_config?.points_table ?? DEFAULT_POINTS_TABLE
  const par = 4

  const players: SimulatedStablefordPlayer[] = DEMO_NAMES.slice(0, 6).map((name, i) => {
    const scores = Array.from({ length: holeCount }, () => randomStrokeScore(rng, par))
    const points = scores.map((s) => scoreToStablefordPoints(s, par, table))
    const total_points = points.reduce((a, b) => a + b, 0)
    return {
      name,
      category_id: getCategoryIdForIndex(config, i),
      handicap_index: Math.round((5 + i * 3) * 10) / 10,
      scores,
      points,
      total_points,
    }
  })

  return {
    kind: 'stableford',
    players,
    format: 'stableford',
    hole_count: holeCount,
  }
}
