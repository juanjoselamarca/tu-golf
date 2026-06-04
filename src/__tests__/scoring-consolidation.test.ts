import { describe, it, expect } from 'vitest'
import { strokesRecibidosEnHoyo, scoreNetoHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'

describe('strokesRecibidosEnHoyo — WHS consolidated', () => {
  it('HCP 18 on 18 holes: 1 stroke per hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
    }
  })

  it('HCP 10 on 18 holes: 1 stroke on SI 1-10, 0 on SI 11-18', () => {
    expect(strokesRecibidosEnHoyo(10, 5, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(10, 10, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(10, 11, 18)).toBe(0)
  })

  it('HCP 30 on 18 holes: 2 strokes on SI 1-12, 1 on SI 13-18', () => {
    expect(strokesRecibidosEnHoyo(30, 1, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(30, 12, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(30, 13, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(30, 18, 18)).toBe(1)
  })

  it('HCP 36 on 18 holes: 2 strokes per hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
    }
  })

  it('HCP 0 (scratch): 0 strokes everywhere', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(0, si, 18)).toBe(0)
    }
  })

  it('negative HCP (plus player): gives back strokes', () => {
    expect(strokesRecibidosEnHoyo(-2, 18, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 17, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 1, 18)).toBe(0)
  })

  it('9-hole round: HCP 5 on 9 holes', () => {
    expect(strokesRecibidosEnHoyo(5, 1, 9)).toBe(1)
    expect(strokesRecibidosEnHoyo(5, 5, 9)).toBe(1)
    expect(strokesRecibidosEnHoyo(5, 6, 9)).toBe(0)
  })
})

describe('puntosStablefordHoyo — uses consolidated strokes', () => {
  it('par on par 4 with HCP 0 = 2 pts', () => {
    expect(puntosStablefordHoyo(4, 4, 0, 1, 18)).toBe(2)
  })

  it('bogey on par 4 with HCP 18 on SI 1 = par neto = 2 pts', () => {
    expect(puntosStablefordHoyo(5, 4, 18, 1, 18)).toBe(2)
  })

  it('double bogey on par 4 with HCP 36 on SI 1 = par neto = 2 pts', () => {
    expect(puntosStablefordHoyo(6, 4, 36, 1, 18)).toBe(2)
  })
})
