import { describe, it, expect } from 'vitest'
import {
  calcularMentalIndex,
  strokesEvitables,
  clasificarHoyo,
  type MentalIndexInput,
} from './mental-index'

describe('calcularMentalIndex', () => {
  it('returns high score for clean profile', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: { id: 'plan_1' },
      outcomes: [
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
      ],
      cpi: {
        score: 92,
        trend: 0.5,
        status: 'established',
        breakdown: { diferencial_avg: 5, consistencia: 25, tendencia: 18, volumen_factor: 1 },
        rondas_usadas: 15,
      },
      totalRounds: 15,
      previousScore: 95,
    }
    const r = calcularMentalIndex(input)
    expect(r.score).toBeGreaterThanOrEqual(95)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.band).toBe('high')
    expect(r.status).toBe('established')
    expect(r.delta).toBe(r.score - 95)
  })

  it('penalizes post_bogey_spiral confidence 0.9 by at least 22 points', () => {
    const input: MentalIndexInput = {
      activePatterns: [{ pattern_type: 'post_bogey_spiral', confidence: 0.9 }],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 5,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    // base 100 - 25*0.9 = 77.5 → 78 redondeado
    expect(r.score).toBeLessThanOrEqual(100 - 22)
    expect(r.band).toBe('high')  // 78 sigue en high
    expect(r.breakdown.patternPenalty).toBeCloseTo(22.5, 1)
  })

  it('skips adherence bonus when no active plan', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 5,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    expect(r.score).toBe(100)
    expect(r.breakdown.adherenceBonus).toBe(0)
    expect(r.breakdown.consistencyBonus).toBe(0)
  })

  it('reports insufficient_data status when < 3 rounds', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 2,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    expect(r.status).toBe('insufficient_data')
  })
})

describe('strokesEvitables', () => {
  it('counts only bogey-followed-by-bogey, contained = bogey simple', () => {
    const round = {
      id: 'r1',
      scores: [5, 6, 4, 4, 5, 4, 3, 4, 5, 6, 5, 3, 4, 7, 7, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(3)
    expect(r.instances[0].round_id).toBe('r1')
    expect(r.instances[0].holes).toEqual(['H1→H2', 'H14→H15'])
  })

  it('skips null scores', () => {
    const round = {
      id: 'r1',
      scores: [5, null, 3, 6, 8, null, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(2)
  })
})

describe('clasificarHoyo', () => {
  it.todo('returns null for null score')
  it.todo('returns tilt for double bogey or worse')
  it.todo('returns tilt for bogey after bogey')
  it.todo('returns tense for isolated bogey')
  it.todo('returns calm for par or better')
})
