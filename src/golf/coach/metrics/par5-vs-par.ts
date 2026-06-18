import type { ComputedMetric, RoundData } from './types'
import { validScores } from './helpers'

export function computePar5VsPar(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let total = 0
  let count = 0
  for (let i = 0; i < 18; i++) {
    if (v.pars[i] === 5) {
      total += v.scores[i] - 5
      count++
    }
  }
  if (count === 0) return { value: null, reason: 'no_par5_holes' }
  return { value: total / count, reason: 'computed', metadata: { par5_count: count } }
}
