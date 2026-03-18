import { describe, it, expect } from 'vitest'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from '@/lib/scoring'

describe('strokesRecibidosEnHoyo', () => {
  it('hcp 18 recibe 1 stroke en cada hoyo', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(18, si)).toBe(1)
    }
  })
  it('hcp 0 no recibe strokes', () => {
    expect(strokesRecibidosEnHoyo(0, 1)).toBe(0)
  })
  it('hcp 36 recibe 2 strokes en todos los hoyos', () => {
    expect(strokesRecibidosEnHoyo(36, 1)).toBe(2)
  })
})

describe('puntosStablefordHoyo', () => {
  it('par neto da 2 puntos', () => {
    expect(puntosStablefordHoyo(4, 4, 0, 9)).toBe(2)
  })
  it('birdie neto da 3 puntos', () => {
    expect(puntosStablefordHoyo(3, 4, 0, 9)).toBe(3)
  })
  it('eagle neto da 4 puntos', () => {
    expect(puntosStablefordHoyo(2, 4, 0, 9)).toBe(4)
  })
  it('doble bogey neto da 0 puntos', () => {
    expect(puntosStablefordHoyo(6, 4, 0, 9)).toBe(0)
  })
})
