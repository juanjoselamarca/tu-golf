import type { ComputedMetric, RoundData } from './types'
import { validScores } from './helpers'

export function computePar3VsPar(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let total = 0
  let count = 0
  for (let i = 0; i < 18; i++) {
    if (v.pars[i] === 3) {
      total += v.scores[i] - 3
      count++
    }
  }
  if (count === 0) return { value: null, reason: 'no_par3_holes' }
  return { value: total / count, reason: 'computed', metadata: { par3_count: count } }
}
