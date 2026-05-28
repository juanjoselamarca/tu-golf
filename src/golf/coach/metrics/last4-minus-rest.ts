import type { ComputedMetric, RoundData } from './types'
import { sum, validScores } from './helpers'

export function computeLast4MinusRest(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  const last4Avg = sum(v.scores.slice(14, 18)) / 4
  const restAvg = sum(v.scores.slice(0, 14)) / 14
  return { value: last4Avg - restAvg, reason: 'computed' }
}
