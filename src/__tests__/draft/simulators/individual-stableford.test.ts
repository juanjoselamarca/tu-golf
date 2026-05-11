// src/__tests__/draft/simulators/individual-stableford.test.ts
import { describe, it, expect } from 'vitest'
import {
  scoreToStablefordPoints,
  simulateIndividualStableford,
} from '@/lib/draft/simulators/individual-stableford'
import { makeBaseConfig } from './test-helpers'

const DEFAULT_TABLE = {
  albatross_or_better: 5,
  eagle: 4,
  birdie: 3,
  par: 2,
  bogey: 1,
  double_or_worse: 0,
}

describe('scoreToStablefordPoints (USGA default table)', () => {
  it('mapea score → puntos correctamente en par 4', () => {
    expect(scoreToStablefordPoints(1, 4, DEFAULT_TABLE)).toBe(5) // albatross (eagle-1)
    expect(scoreToStablefordPoints(2, 4, DEFAULT_TABLE)).toBe(4) // eagle
    expect(scoreToStablefordPoints(3, 4, DEFAULT_TABLE)).toBe(3) // birdie
    expect(scoreToStablefordPoints(4, 4, DEFAULT_TABLE)).toBe(2) // par
    expect(scoreToStablefordPoints(5, 4, DEFAULT_TABLE)).toBe(1) // bogey
    expect(scoreToStablefordPoints(6, 4, DEFAULT_TABLE)).toBe(0) // doble
    expect(scoreToStablefordPoints(8, 4, DEFAULT_TABLE)).toBe(0) // triple+ = 0
  })
})

describe('simulateIndividualStableford', () => {
  it('genera players con scores + points + total_points coherentes', () => {
    const c = makeBaseConfig({ format: 'stableford', modo: 'neto' })
    const r = simulateIndividualStableford(c, 42)
    expect(r.kind).toBe('stableford')
    expect(r.format).toBe('stableford')
    expect(r.hole_count).toBe(18)
    expect(r.players.length).toBeGreaterThanOrEqual(4)
    for (const p of r.players) {
      expect(p.scores).toHaveLength(18)
      expect(p.points).toHaveLength(18)
      const sum = p.points.reduce((a, b) => a + b, 0)
      expect(p.total_points).toBe(sum)
      // Default table: par=2, max razonable es 18*5=90, min es 0
      expect(p.total_points).toBeGreaterThanOrEqual(0)
      expect(p.total_points).toBeLessThanOrEqual(18 * 5)
    }
  })

  it('respeta points_table custom del config', () => {
    const c = makeBaseConfig({
      format: 'stableford',
      modo: 'neto',
      stableford_config: {
        points_table: {
          albatross_or_better: 8,
          eagle: 6,
          birdie: 4,
          par: 2,
          bogey: 1,
          double_or_worse: 0,
        },
      },
    })
    const r = simulateIndividualStableford(c, 42)
    // Solo chequeamos que los puntos no salen del rango de la tabla custom
    for (const p of r.players) {
      for (const pts of p.points) {
        expect(pts).toBeGreaterThanOrEqual(0)
        expect(pts).toBeLessThanOrEqual(8)
      }
    }
  })
})
