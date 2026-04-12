import { describe, it, expect } from 'vitest'
import {
  varianzaPorHoyo,
  sigmaTotal,
  probResultadoHoyo,
  calcularGWI,
  type JugadorGWIInput,
} from '../golf/stats/gwi'

function makeJugador(overrides: Partial<JugadorGWIInput> = {}): JugadorGWIInput {
  return {
    id: 'j1',
    nombre: 'Juan',
    handicapIndex: 12,
    currentScore: 0,
    hoyosCompletados: 0,
    modoJuego: 'gross',
    formatoJuego: 'stroke_play',
    historicalAvg: 0,
    historicalRoundsCount: 0,
    courseAvg: null,
    courseRoundsCount: 0,
    patterns: null,
    ...overrides,
  }
}

describe('GWI — varianzaPorHoyo', () => {
  it('par 3 has lower base variance than par 5', () => {
    expect(varianzaPorHoyo(0, 3)).toBeLessThan(varianzaPorHoyo(0, 5))
  })

  it('higher handicap → higher variance', () => {
    expect(varianzaPorHoyo(0, 4)).toBeLessThan(varianzaPorHoyo(36, 4))
  })

  it('clamps handicap to [0, 54]', () => {
    expect(varianzaPorHoyo(-5, 4)).toBe(varianzaPorHoyo(0, 4))
    expect(varianzaPorHoyo(100, 4)).toBe(varianzaPorHoyo(54, 4))
  })

  it('default par is 4', () => {
    expect(varianzaPorHoyo(10)).toBe(varianzaPorHoyo(10, 4))
  })

  it('returns positive values for typical inputs', () => {
    for (let hcp = 0; hcp <= 36; hcp += 6) {
      for (const par of [3, 4, 5]) {
        expect(varianzaPorHoyo(hcp, par)).toBeGreaterThan(0)
      }
    }
  })
})

describe('GWI — sigmaTotal', () => {
  it('sigma scales with sqrt of holes remaining', () => {
    const s1 = sigmaTotal(10, 1)
    const s4 = sigmaTotal(10, 4)
    // s4 should be ~ 2x s1 (sqrt(4)=2)
    expect(s4 / s1).toBeCloseTo(2, 1)
  })

  it('zero holes remaining → zero sigma', () => {
    expect(sigmaTotal(10, 0)).toBe(0)
  })

  it('negative holes treated as zero', () => {
    expect(sigmaTotal(10, -5)).toBe(0)
  })
})

describe('GWI — probResultadoHoyo', () => {
  it('probabilities are non-negative integers', () => {
    const p = probResultadoHoyo(15, 4)
    expect(p.eagle).toBeGreaterThanOrEqual(0)
    expect(p.birdie).toBeGreaterThanOrEqual(0)
    expect(p.par).toBeGreaterThanOrEqual(0)
    expect(p.bogey).toBeGreaterThanOrEqual(0)
    expect(p.doble).toBeGreaterThanOrEqual(0)
    expect(p.masDoble).toBeGreaterThanOrEqual(0)
  })

  it('probabilities sum to ~100', () => {
    const p = probResultadoHoyo(15, 4)
    const total = p.eagle + p.birdie + p.par + p.bogey + p.doble + p.masDoble
    expect(total).toBeGreaterThanOrEqual(99)
    expect(total).toBeLessThanOrEqual(101)
  })

  it('low handicap player has higher par/birdie than high handicap', () => {
    const scratch = probResultadoHoyo(0, 4)
    const high    = probResultadoHoyo(30, 4)
    expect(scratch.par + scratch.birdie).toBeGreaterThan(high.par + high.birdie)
  })

  it('high handicap player has more bogeys/doubles', () => {
    const scratch = probResultadoHoyo(0, 4)
    const high    = probResultadoHoyo(30, 4)
    expect(high.bogey + high.doble + high.masDoble).toBeGreaterThan(scratch.bogey + scratch.doble + scratch.masDoble)
  })
})

describe('GWI — calcularGWI edge cases', () => {
  it('empty array returns empty', () => {
    expect(calcularGWI([], 18)).toEqual([])
  })

  it('single player returns 100% win probability', () => {
    const result = calcularGWI([makeJugador()], 18)
    expect(result).toHaveLength(1)
    expect(result[0].winProbability).toBe(100)
    expect(result[0].narrativa).toBe('Jugando solo')
  })

  it('two equal players → ~50/50 split', () => {
    const result = calcularGWI([
      makeJugador({ id: 'a', nombre: 'A' }),
      makeJugador({ id: 'b', nombre: 'B' }),
    ], 18)
    expect(result).toHaveLength(2)
    // Should sum to 100
    const sum = result.reduce((s, r) => s + r.winProbability, 0)
    expect(sum).toBe(100)
    // Each ~50% (within 5%)
    expect(result[0].winProbability).toBeGreaterThanOrEqual(45)
    expect(result[0].winProbability).toBeLessThanOrEqual(55)
  })

  it('probabilities always sum to exactly 100', () => {
    for (const n of [2, 3, 4, 5, 8]) {
      const players = Array.from({ length: n }, (_, i) =>
        makeJugador({ id: `p${i}`, nombre: `Player ${i}`, currentScore: i, handicapIndex: 5 + i * 3 })
      )
      const result = calcularGWI(players, 18)
      const sum = result.reduce((s, r) => s + r.winProbability, 0)
      expect(sum).toBe(100)
    }
  })

  it('every player gets at least 1% probability', () => {
    const players = [
      makeJugador({ id: 'leader', currentScore: -10, hoyosCompletados: 17 }),
      makeJugador({ id: 'losing', currentScore: 30, hoyosCompletados: 17 }),
    ]
    const result = calcularGWI(players, 18)
    expect(result.find(r => r.id === 'losing')!.winProbability).toBeGreaterThanOrEqual(1)
  })
})

describe('GWI — calcularGWI scoring logic', () => {
  it('player with lower score (gross) wins more', () => {
    const result = calcularGWI([
      makeJugador({ id: 'lead', nombre: 'Lead', currentScore: -3, hoyosCompletados: 9 }),
      makeJugador({ id: 'trail', nombre: 'Trail', currentScore: 3, hoyosCompletados: 9 }),
    ], 18)
    const lead = result.find(r => r.id === 'lead')!
    const trail = result.find(r => r.id === 'trail')!
    expect(lead.winProbability).toBeGreaterThan(trail.winProbability)
  })

  it('stableford: higher score wins (inverted)', () => {
    const result = calcularGWI([
      makeJugador({ id: 'high', nombre: 'High', currentScore: 25, hoyosCompletados: 9, formatoJuego: 'stableford' }),
      makeJugador({ id: 'low', nombre: 'Low', currentScore: 10, hoyosCompletados: 9, formatoJuego: 'stableford' }),
    ], 18)
    const high = result.find(r => r.id === 'high')!
    const low = result.find(r => r.id === 'low')!
    expect(high.winProbability).toBeGreaterThan(low.winProbability)
  })

  it('breakdown contains all four factors with non-negative weights', () => {
    const result = calcularGWI([
      makeJugador({ id: 'a' }),
      makeJugador({ id: 'b' }),
    ], 18)
    const b = result[0].breakdown
    expect(b.situacion.peso).toBeGreaterThanOrEqual(0)
    expect(b.historico.peso).toBeGreaterThanOrEqual(0)
    expect(b.cancha.peso).toBeGreaterThanOrEqual(0)
    expect(b.patrones.peso).toBeGreaterThanOrEqual(0)
    // situacion is the dominant factor early in round
    expect(b.situacion.peso).toBeGreaterThan(b.historico.peso)
  })

  it('low handicap → low volatility label', () => {
    const result = calcularGWI([
      makeJugador({ id: 'pro', handicapIndex: 3 }),
      makeJugador({ id: 'amateur', handicapIndex: 22 }),
    ], 18)
    expect(result.find(r => r.id === 'pro')!.volatilidad).toBe('baja')
    expect(result.find(r => r.id === 'amateur')!.volatilidad).toBe('alta')
  })

  it('round finished → narrativa says so', () => {
    const result = calcularGWI([
      makeJugador({ id: 'a', hoyosCompletados: 18 }),
      makeJugador({ id: 'b', hoyosCompletados: 18 }),
    ], 18)
    expect(result[0].narrativa).toBe('Ronda finalizada')
  })

  it('returns valid winProbability range [0, 100]', () => {
    const result = calcularGWI([
      makeJugador({ id: 'a', currentScore: -20 }),
      makeJugador({ id: 'b', currentScore: 50 }),
      makeJugador({ id: 'c', currentScore: 0 }),
    ], 18)
    for (const r of result) {
      expect(r.winProbability).toBeGreaterThanOrEqual(0)
      expect(r.winProbability).toBeLessThanOrEqual(100)
    }
  })
})
