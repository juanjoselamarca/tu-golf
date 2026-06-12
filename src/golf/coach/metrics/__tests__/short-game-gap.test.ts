import { describe, it, expect } from 'vitest'
import { computeShortGameGap } from '../short-game-gap'
import { STANDARD_PARS } from '../helpers'
import type { RoundData } from '../types'

function round(scores: (number | null)[], pars: number[] = STANDARD_PARS): RoundData {
  return { id: 'r', scores, total_gross: null, par_per_hole: pars, played_at: '2026-01-01', metadata: null }
}

describe('computeShortGameGap — over-par par4 menos over-par par5 por ronda', () => {
  it('computa el gap (par4 over 2, par5 over 0 → gap 2)', () => {
    // par4 → score par+2, par5 → score par+0, par3 → par.
    const scores = STANDARD_PARS.map((p) => (p === 4 ? p + 2 : p === 5 ? p + 0 : p))
    const r = computeShortGameGap(round(scores))
    expect(r.value).toBeCloseTo(2, 5)
    expect(r.reason).toBe('computed')
    expect(r.metadata).toMatchObject({ par4_count: 10, par5_count: 4 })
  })

  it('degrada honesto si no hay suficientes par4/par5 (cancha toda par 3)', () => {
    const allPar3 = Array(18).fill(3)
    const r = computeShortGameGap(round(Array(18).fill(3), allPar3))
    expect(r.value).toBeNull()
    expect(r.reason).toBe('insufficient_par45_holes')
  })

  it('degrada honesto si la ronda no tiene 18 scores', () => {
    const r = computeShortGameGap(round([4, 4, 3]))
    expect(r.value).toBeNull()
  })
})
