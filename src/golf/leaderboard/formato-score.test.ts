import { describe, it, expect } from 'vitest'
import { formatPuntosStableford, formatScoreDelRanking } from './formato-score'

describe('formatScoreDelRanking — el signo es del vs par, no de los puntos', () => {
  it('puntos Stableford sin signo (36, no +36), también 0', () => {
    expect(formatScoreDelRanking(36, true)).toBe('36')
    expect(formatScoreDelRanking(0, true)).toBe('0')
    expect(formatScoreDelRanking(36, true, { conUnidad: true })).toBe('36 pts')
  })
  it('vs par con signo y "E" en par', () => {
    expect(formatScoreDelRanking(3, false)).toBe('+3')
    expect(formatScoreDelRanking(0, false)).toBe('E')
    expect(formatScoreDelRanking(-2, false)).toBe('-2')
  })
  it('formatPuntosStableford', () => {
    expect(formatPuntosStableford(40)).toBe('40')
  })
})
