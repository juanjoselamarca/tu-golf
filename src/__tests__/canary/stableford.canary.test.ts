import { describe, it, expect } from 'vitest'
import {
  calcularStableford,
  puntosStablefordHoyo,
  strokesRecibidosEnHoyo,
} from '@/golf/core/stableford-score'

describe('Stableford — Tests Canario', () => {
  const par18 = {
    1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
    10: 4, 11: 4, 12: 3, 13: 5, 14: 4, 15: 3, 16: 4, 17: 4, 18: 5,
  }
  const siLosLeones = {
    1: 13, 2: 7, 3: 15, 4: 1, 5: 11, 6: 17, 7: 3, 8: 9, 9: 5,
    10: 12, 11: 16, 12: 6, 13: 2, 14: 18, 15: 10, 16: 4, 17: 8, 18: 14,
  }

  describe('Tabla de puntos R&A', () => {
    it('Doble Eagle (-3) = 5 puntos', () => {
      expect(puntosStablefordHoyo(2, 5)).toBe(5)
    })
    it('Eagle (-2) = 4 puntos', () => {
      expect(puntosStablefordHoyo(3, 5)).toBe(4)
    })
    it('Birdie (-1) = 3 puntos', () => {
      expect(puntosStablefordHoyo(3, 4)).toBe(3)
    })
    it('Par = 2 puntos', () => {
      expect(puntosStablefordHoyo(4, 4)).toBe(2)
    })
    it('Bogey = 1 punto', () => {
      expect(puntosStablefordHoyo(5, 4)).toBe(1)
    })
    it('Doble bogey o peor = 0 puntos', () => {
      expect(puntosStablefordHoyo(6, 4)).toBe(0)
      expect(puntosStablefordHoyo(10, 4)).toBe(0)
    })
  })

  describe('Strokes recibidos', () => {
    it('HCP 0 no recibe golpes', () => {
      expect(strokesRecibidosEnHoyo(0, 1, 18)).toBe(0)
    })
    it('HCP 18 recibe 1 golpe en todos los hoyos de 18', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
      }
    })
    it('HCP 9 recibe golpes solo en SI 1-9', () => {
      expect(strokesRecibidosEnHoyo(9, 1, 18)).toBe(1)
      expect(strokesRecibidosEnHoyo(9, 9, 18)).toBe(1)
      expect(strokesRecibidosEnHoyo(9, 10, 18)).toBe(0)
    })
    it('HCP 27 recibe 2 golpes en SI 1-9, 1 en SI 10-18', () => {
      expect(strokesRecibidosEnHoyo(27, 1, 18)).toBe(2)
      expect(strokesRecibidosEnHoyo(27, 9, 18)).toBe(2)
      expect(strokesRecibidosEnHoyo(27, 10, 18)).toBe(1)
    })
  })

  describe('Cálculo de ronda completa', () => {
    it('Jugador HCP 18 jugando bogey todos los hoyos = 36 puntos', () => {
      const scores = {
        1: 5, 2: 5, 3: 4, 4: 6, 5: 5, 6: 4, 7: 5, 8: 5, 9: 6,
        10: 5, 11: 5, 12: 4, 13: 6, 14: 5, 15: 4, 16: 5, 17: 5, 18: 6,
      }
      const result = calcularStableford({
        scores,
        roundHoles: 18,
        parMap: par18,
        courseHandicap: 18,
        strokeIndexMap: siLosLeones,
      })
      expect(result.puntosTotales).toBe(36)
      expect(result.holesPlayed).toBe(18)
    })

    it('Ronda de 9 hoyos no asume parTotal 72', () => {
      const par9 = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }
      const si9 = { 1: 7, 2: 3, 3: 9, 4: 1, 5: 5, 6: 8, 7: 2, 8: 6, 9: 4 }
      const scores = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 }
      const result = calcularStableford({
        scores,
        roundHoles: 9,
        parMap: par9,
        courseHandicap: 0,
        strokeIndexMap: si9,
      })
      expect(result.parTotalRonda).toBe(36)
      expect(result.puntosTotales).toBe(18)
    })
  })

  describe('Ordenamiento', () => {
    it('Más puntos = mejor (DESC)', () => {
      const players = [
        { name: 'A', pts: 28 },
        { name: 'B', pts: 36 },
        { name: 'C', pts: 15 },
      ]
      const sorted = [...players].sort((a, b) => b.pts - a.pts)
      expect(sorted.map(p => p.name)).toEqual(['B', 'A', 'C'])
    })
  })
})
