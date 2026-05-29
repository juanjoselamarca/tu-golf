import type { ComputedMetric, RoundData } from './types'
import { sum, validScores } from './helpers'

export function computeBack9MinusFront9(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  const front = sum(v.scores.slice(0, 9))
  const back = sum(v.scores.slice(9, 18))
  return { value: back - front, reason: 'computed', metadata: { front, back } }
}
