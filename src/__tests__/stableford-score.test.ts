import { describe, it, expect } from 'vitest'
import {
  puntosStablefordHoyo,
  calcularStableford,
  strokesRecibidosEnHoyo,
} from '../golf/core/stableford-score'

describe('puntosStablefordHoyo — R&A Rule 32.1', () => {
  it('double eagle or better → 5 pts', () => {
    expect(puntosStablefordHoyo(1, 4)).toBe(5)
    expect(puntosStablefordHoyo(2, 5)).toBe(5)
  })

  it('eagle → 4 pts', () => {
    expect(puntosStablefordHoyo(2, 4)).toBe(4)
    expect(puntosStablefordHoyo(3, 5)).toBe(4)
  })

  it('birdie → 3 pts', () => {
    expect(puntosStablefordHoyo(3, 4)).toBe(3)
    expect(puntosStablefordHoyo(2, 3)).toBe(3)
    expect(puntosStablefordHoyo(4, 5)).toBe(3)
  })

  it('par → 2 pts', () => {
    expect(puntosStablefordHoyo(3, 3)).toBe(2)
    expect(puntosStablefordHoyo(4, 4)).toBe(2)
    expect(puntosStablefordHoyo(5, 5)).toBe(2)
  })

  it('bogey → 1 pt', () => {
    expect(puntosStablefordHoyo(5, 4)).toBe(1)
    expect(puntosStablefordHoyo(4, 3)).toBe(1)
  })

  it('double bogey or worse → 0 pts', () => {
    expect(puntosStablefordHoyo(6, 4)).toBe(0)
    expect(puntosStablefordHoyo(7, 4)).toBe(0)
    expect(puntosStablefordHoyo(10, 4)).toBe(0)
  })
})

describe('strokesRecibidosEnHoyo', () => {
  it('handicap 0 → no strokes on any hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(0, si, 18)).toBe(0)
    }
  })

  it('handicap 18 on 18-hole round → 1 stroke on every hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
    }
  })

  it('handicap 9 → 1 stroke on SI 1-9 only', () => {
    for (let si = 1; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(9, si, 18)).toBe(1)
    }
    for (let si = 10; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(9, si, 18)).toBe(0)
    }
  })

  it('handicap 20 → 2 strokes on SI 1-2, 1 stroke on SI 3-18', () => {
    expect(strokesRecibidosEnHoyo(20, 1, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(20, 2, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(20, 3, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(20, 18, 18)).toBe(1)
  })

  it('handicap 36 → 2 strokes on all holes', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
    }
  })

  it('works for 9-hole rounds', () => {
    // HCP 5 on 9 holes: strokes on SI 1-5
    expect(strokesRecibidosEnHoyo(5, 3, 9)).toBe(1)
    expect(strokesRecibidosEnHoyo(5, 6, 9)).toBe(0)
  })

  it('negative handicap (plus player) → gives back strokes on lowest SI', () => {
    expect(strokesRecibidosEnHoyo(-2, 1, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 2, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 3, 18)).toBe(0)
  })
})

describe('calcularStableford — ronda completa', () => {
  const parMap: Record<number, number> = {}
  const siMap: Record<number, number> = {}
  for (let h = 1; h <= 18; h++) {
    parMap[h] = 4
    siMap[h] = h
  }

  it('scratch player scoring all pars → 36 pts', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 18; h++) scores[String(h)] = 4
    const result = calcularStableford({
      scores, roundHoles: 18, parMap, courseHandicap: 0, strokeIndexMap: siMap,
    })
    expect(result.puntosTotales).toBe(36) // 18 × 2 pts
    expect(result.pares).toBe(18)
    expect(result.holesPlayed).toBe(18)
  })

  it('handicap player gets extra strokes', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 18; h++) scores[String(h)] = 5 // all bogey gross
    const result = calcularStableford({
      scores, roundHoles: 18, parMap, courseHandicap: 18, strokeIndexMap: siMap,
    })
    // With HCP 18: each hole gets 1 stroke, so net = 5-1 = 4 = par = 2 pts each
    expect(result.puntosTotales).toBe(36)
  })

  it('handles 9-hole round', () => {
    const scores9: Record<string, number> = {}
    const parMap9: Record<number, number> = {}
    const siMap9: Record<number, number> = {}
    for (let h = 1; h <= 9; h++) {
      scores9[String(h)] = 4
      parMap9[h] = 4
      siMap9[h] = h
    }
    const result = calcularStableford({
      scores: scores9, roundHoles: 9, parMap: parMap9, courseHandicap: 0, strokeIndexMap: siMap9,
    })
    expect(result.puntosTotales).toBe(18) // 9 × 2 pts
    expect(result.holesPlayed).toBe(9)
  })

  it('skips holes without scores', () => {
    const scores: Record<string, number> = { '1': 4, '2': 4 }
    const result = calcularStableford({
      scores, roundHoles: 18, parMap, courseHandicap: 0, strokeIndexMap: siMap,
    })
    expect(result.holesPlayed).toBe(2)
    expect(result.puntosTotales).toBe(4) // 2 × 2 pts
  })

  it('breakdown counts are correct', () => {
    const scores: Record<string, number> = {
      '1': 2, // eagle (neto = 2, par 4, -2 = 4pts)
      '2': 3, // birdie
      '3': 4, // par
      '4': 5, // bogey
      '5': 6, // double
    }
    const result = calcularStableford({
      scores, roundHoles: 18, parMap, courseHandicap: 0, strokeIndexMap: siMap,
    })
    expect(result.eagles).toBe(1)
    expect(result.birdies).toBe(1)
    expect(result.pares).toBe(1)
    expect(result.bogeys).toBe(1)
    expect(result.dobleOpeor).toBe(1)
  })
})
