import { describe, it, expect } from 'vitest'
import { computeThreePuttRate } from '../three-putt-rate'
import type { RoundData } from '../types'

function round(putts: unknown): RoundData {
  return {
    id: 'r', scores: null, total_gross: null, par_per_hole: [], played_at: '2026-01-01',
    metadata: putts === undefined ? null : { putts },
  }
}

describe('computeThreePuttRate — fracción de greens con 3+ putts por ronda', () => {
  it('computa el rate desde metadata.putts (3 de 18 → 0.1667)', () => {
    const putts = [3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    const r = computeThreePuttRate(round(putts))
    expect(r.value).toBeCloseTo(3 / 18, 5)
    expect(r.reason).toBe('computed')
    expect(r.metadata).toMatchObject({ three_putts: 3, total_greens: 18 })
  })

  it('degrada honesto sin metadata de putts', () => {
    expect(computeThreePuttRate(round(undefined)).reason).toBe('no_putts_metadata')
    expect(computeThreePuttRate(round('no-array')).reason).toBe('no_putts_metadata')
  })

  it('degrada honesto con menos de 9 greens con dato', () => {
    const putts = [2, 2, 3, 2, 2, null, null, null, null, null, null, null, null, null, null, null, null, null]
    const r = computeThreePuttRate(round(putts))
    expect(r.value).toBeNull()
    expect(r.reason).toBe('insufficient_greens')
  })
})
