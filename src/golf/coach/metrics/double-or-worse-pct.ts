import type { ComputedMetric, RoundData } from './types'
import { validScores } from './helpers'

export function computeDoubleOrWorsePct(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let dbl = 0
  for (let i = 0; i < 18; i++) {
    if (v.scores[i] - v.pars[i] >= 2) dbl++
  }
  return { value: dbl / 18, reason: 'computed', metadata: { double_or_worse: dbl } }
}
