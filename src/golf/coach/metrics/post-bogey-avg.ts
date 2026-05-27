import type { ComputedMetric, RoundData } from './types'
import { validScores } from './helpers'

export function computePostBogeyAvg(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let total = 0
  let count = 0
  for (let i = 0; i < 17; i++) {
    const overPar = v.scores[i] - v.pars[i]
    if (overPar >= 1) {
      total += v.scores[i + 1]
      count++
    }
  }
  if (count === 0) return { value: null, reason: 'no_bogey_or_worse' }
  return { value: total / count, reason: 'computed', metadata: { post_bogey_count: count } }
}
