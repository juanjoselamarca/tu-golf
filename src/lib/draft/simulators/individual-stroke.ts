// src/lib/draft/simulators/individual-stroke.ts
//
// Simulador para stroke play individual. Genera 6 jugadores demo con scores
// realistas para `rounds[0].hole_count` hoyos. Score por hoyo: birdie/par/
// bogey/doble con distribución ~10/60/20/10.
import type { TournamentConfig } from '../types'
import {
  DEMO_NAMES,
  type SimulatedIndividualResult,
  type SimulatedPlayer,
  getCategoryIdForIndex,
  getHoleCount,
  makeRng,
  randomStrokeScore,
} from './_shared'

export function simulateIndividualStroke(
  config: TournamentConfig,
  seed?: number,
): SimulatedIndividualResult {
  const rng = makeRng(seed)
  const holeCount = getHoleCount(config)
  const players: SimulatedPlayer[] = DEMO_NAMES.slice(0, 6).map((name, i) => ({
    name,
    category_id: getCategoryIdForIndex(config, i),
    handicap_index: Math.round((5 + i * 3) * 10) / 10,
    scores: Array.from({ length: holeCount }, () => randomStrokeScore(rng, 4)),
  }))
  return {
    kind: 'individual',
    players,
    format: 'stroke_play',
    hole_count: holeCount,
  }
}
