import type { ComputedMetric, RoundData } from './types'

export function computeFirstHole(round: RoundData): ComputedMetric {
  const s = round.scores?.[0]
  if (typeof s !== 'number') return { value: null, reason: 'no_first_hole_score' }
  return { value: s, reason: 'computed' }
}
