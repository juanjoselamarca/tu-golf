import { describe, it, expect } from 'vitest'
import { calcularGWIMatch } from '../golf/stats/gwi-match'
import type { MatchGWIInput } from '../golf/stats/gwi-match'

function makeInput(overrides: Partial<MatchGWIInput> = {}): MatchGWIInput {
  return {
    nombreA: 'Juan',
    nombreB: 'Pedro',
    handicapA: 10,
    handicapB: 20,
    holesUp: 0,
    holesRemaining: 18,
    roundsCountA: 10,
    roundsCountB: 10,
    ...overrides,
  }
}

describe('GWI Match Play', () => {
  it('probabilities sum to 100', () => {
    const result = calcularGWIMatch(makeInput())
    expect(result.probA + result.probB + result.probTie).toBe(100)
  })

  it('all square at start — roughly even', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: 0, holesRemaining: 18 }))
    // With handicap diff, should not be exactly 50/50 but not wildly skewed
    expect(result.probA).toBeGreaterThan(10)
    expect(result.probB).toBeGreaterThan(10)
  })

  it('big lead → high probability', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: 5, holesRemaining: 6 }))
    expect(result.probA).toBeGreaterThan(80)
  })

  it('big deficit → low probability', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: -5, holesRemaining: 6 }))
    expect(result.probA).toBeLessThan(20)
  })

  it('match already won (holesUp > remaining)', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: 4, holesRemaining: 3 }))
    expect(result.probA).toBe(100)
    expect(result.probB).toBe(0)
  })

  it('match already lost', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: -4, holesRemaining: 3 }))
    expect(result.probA).toBe(0)
    expect(result.probB).toBe(100)
  })

  it('all square, 0 remaining → tie', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: 0, holesRemaining: 0 }))
    expect(result.probTie).toBe(100)
    expect(result.probA).toBe(0)
    expect(result.probB).toBe(0)
  })

  it('1 up, 0 remaining → A wins', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: 1, holesRemaining: 0 }))
    expect(result.probA).toBe(100)
  })

  it('dormie situation: lead equals remaining', () => {
    // Use equal handicaps so A clearly leads
    const result = calcularGWIMatch(makeInput({
      handicapA: 15, handicapB: 15, holesUp: 3, holesRemaining: 3,
    }))
    // A should have very high probability (can only tie or win)
    expect(result.probA + result.probTie).toBeGreaterThan(80)
    expect(result.narrativa).toContain('dormie')
  })

  it('close match late → exciting narrativa', () => {
    const result = calcularGWIMatch(makeInput({ holesUp: 1, holesRemaining: 2 }))
    expect(result.narrativa.length).toBeGreaterThan(0)
  })

  it('equal handicaps → more balanced', () => {
    const result = calcularGWIMatch(makeInput({
      handicapA: 15, handicapB: 15, holesUp: 0, holesRemaining: 9,
    }))
    // Should be roughly balanced
    expect(Math.abs(result.probA - result.probB)).toBeLessThan(20)
  })

  it('9 hole match works', () => {
    const result = calcularGWIMatch(makeInput({ holesRemaining: 4, holesUp: 2 }))
    expect(result.probA + result.probB + result.probTie).toBe(100)
    expect(result.probA).toBeGreaterThan(50)
  })
})
