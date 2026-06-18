import type { ComputedMetric, RoundData } from './types'
import { validScores } from './helpers'

export function computePar4VsPar(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let total = 0
  let count = 0
  for (let i = 0; i < 18; i++) {
    if (v.pars[i] === 4) {
      total += v.scores[i] - 4
      count++
    }
  }
  if (count === 0) return { value: null, reason: 'no_par4_holes' }
  return { value: total / count, reason: 'computed', metadata: { par4_count: count } }
}
