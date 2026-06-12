import type { ComputedMetric, RoundData } from './types'

/**
 * Fracción de greens con 3+ putts en la ronda (patrón `three_putt_frequency`).
 * Lee `metadata.putts` (array per-hoyo `(number|null)[]`, mismo shape que el
 * detect de patterns.ts). Mínimo 9 greens con dato; si no, degrada honesto.
 */
export function computeThreePuttRate(round: RoundData): ComputedMetric {
  const meta = round.metadata as Record<string, unknown> | null
  const putts = meta?.putts
  if (!Array.isArray(putts)) return { value: null, reason: 'no_putts_metadata' }

  let threePutts = 0, greens = 0
  for (const p of putts) {
    if (typeof p !== 'number') continue
    greens++
    if (p >= 3) threePutts++
  }
  if (greens < 9) return { value: null, reason: 'insufficient_greens' }

  return { value: threePutts / greens, reason: 'computed', metadata: { three_putts: threePutts, total_greens: greens } }
}
