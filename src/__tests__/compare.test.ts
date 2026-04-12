import { describe, it, expect } from 'vitest'
import {
  vsPar,
  bestRoundByVsPar,
  sortRoundsByPerformance,
  topRoundsByPerformance,
  splitByHoles,
  countByResult,
  type RoundForCompare,
} from '../golf/core/compare'

function makeRound(gross: number, holes?: number, vsParVal?: number): RoundForCompare {
  return { total_gross: gross, holes_played: holes ?? 18, vsPar: vsParVal ?? undefined }
}

describe('vsPar', () => {
  it('uses precomputed vsPar if available', () => {
    expect(vsPar({ total_gross: 90, vsPar: 5 })).toBe(5)
  })

  it('calculates from gross for 18 holes (par 72)', () => {
    expect(vsPar(makeRound(72))).toBe(0)
    expect(vsPar(makeRound(80))).toBe(8)
    expect(vsPar(makeRound(68))).toBe(-4)
  })

  it('calculates from gross for 9 holes (par 36)', () => {
    expect(vsPar(makeRound(36, 9))).toBe(0)
    expect(vsPar(makeRound(40, 9))).toBe(4)
  })

  it('defaults to 18 holes when holes_played is null', () => {
    expect(vsPar({ total_gross: 80, holes_played: null })).toBe(8)
  })
})

describe('bestRoundByVsPar', () => {
  it('returns null for empty array', () => {
    expect(bestRoundByVsPar([])).toBeNull()
  })

  it('finds the round with lowest vsPar', () => {
    const rounds = [makeRound(80), makeRound(72), makeRound(85)]
    expect(bestRoundByVsPar(rounds)!.total_gross).toBe(72)
  })

  it('correctly compares 9-hole vs 18-hole rounds', () => {
    const r18 = makeRound(75, 18) // +3 vs par 72
    const r9 = makeRound(37, 9)   // +1 vs par 36
    expect(bestRoundByVsPar([r18, r9])!.total_gross).toBe(37) // 9-hole is better
  })
})

describe('sortRoundsByPerformance', () => {
  it('sorts best (lowest vsPar) first', () => {
    const rounds = [makeRound(85), makeRound(72), makeRound(78)]
    const sorted = sortRoundsByPerformance(rounds)
    expect(sorted[0].total_gross).toBe(72)
    expect(sorted[2].total_gross).toBe(85)
  })

  it('does not mutate original array', () => {
    const rounds = [makeRound(85), makeRound(72)]
    sortRoundsByPerformance(rounds)
    expect(rounds[0].total_gross).toBe(85) // unchanged
  })
})

describe('topRoundsByPerformance', () => {
  it('returns top N rounds', () => {
    const rounds = [makeRound(90), makeRound(72), makeRound(80), makeRound(75)]
    const top2 = topRoundsByPerformance(rounds, 2)
    expect(top2).toHaveLength(2)
    expect(top2[0].total_gross).toBe(72)
    expect(top2[1].total_gross).toBe(75)
  })

  it('handles N > rounds.length gracefully', () => {
    const rounds = [makeRound(80)]
    expect(topRoundsByPerformance(rounds, 5)).toHaveLength(1)
  })
})

describe('splitByHoles', () => {
  it('separates 9 and 18 hole rounds', () => {
    const rounds = [makeRound(80, 18), makeRound(40, 9), makeRound(75, 18), makeRound(38, 9)]
    const { rounds18, rounds9 } = splitByHoles(rounds)
    expect(rounds18).toHaveLength(2)
    expect(rounds9).toHaveLength(2)
  })

  it('treats undefined holes_played as 18', () => {
    const { rounds18 } = splitByHoles([{ total_gross: 80 }])
    expect(rounds18).toHaveLength(1)
  })
})

describe('countByResult', () => {
  it('counts all result types correctly', () => {
    // Par 4 for all holes
    const pars = [4, 4, 4, 4, 4, 4, 4, 4, 4]
    const scores = [1, 2, 3, 4, 5, 6, 7, null, 0]
    const result = countByResult(scores, pars)
    expect(result.albatros).toBe(1)  // 1 on par 4 = -3
    expect(result.eagles).toBe(1)    // 2 on par 4 = -2
    expect(result.birdies).toBe(1)   // 3 on par 4 = -1
    expect(result.pars).toBe(1)      // 4 on par 4 = 0
    expect(result.bogeys).toBe(1)    // 5 on par 4 = +1
    expect(result.doubles).toBe(2)   // 6,7 on par 4 = +2, +3
  })

  it('respects different par values per hole', () => {
    const pars = [3, 4, 5]
    const scores = [2, 3, 4]  // All birdies (-1 each)
    const result = countByResult(scores, pars)
    expect(result.birdies).toBe(3)
  })

  it('skips null and zero scores', () => {
    const pars = [4, 4, 4]
    const scores = [null, 0, 4]
    const result = countByResult(scores, pars)
    expect(result.pars).toBe(1)
    expect(result.eagles + result.birdies + result.bogeys + result.doubles).toBe(0)
  })

  it('defaults to par 4 when par data is missing', () => {
    const scores = [4]
    const result = countByResult(scores, [])
    expect(result.pars).toBe(1)
  })
})
