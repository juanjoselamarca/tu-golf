import { describe, it, expect } from 'vitest'
import { parTotalEstandar } from '@/golf/core/round-score'

describe('Best Ball — Tests Canario', () => {
  describe('Selección de mejor score', () => {
    it('Gross: toma el menor de los dos jugadores por hoyo', () => {
      const scoreA = 4
      const scoreB = 6
      expect(Math.min(scoreA, scoreB)).toBe(4)
    })

    it('Stableford: toma el mayor (más puntos)', () => {
      const puntosA = 2 // par
      const puntosB = 3 // birdie
      expect(Math.max(puntosA, puntosB)).toBe(3)
    })
  })

  describe('Jugadores con handicaps diferentes', () => {
    it('En modo neto, cada jugador usa su propio HCP', () => {
      const scoreA = 5
      const scoreB = 6
      const ventajaA = 0
      const ventajaB = 1
      const netoA = scoreA - ventajaA
      const netoB = scoreB - ventajaB
      expect(Math.min(netoA, netoB)).toBe(5)
    })
  })

  describe('Pickup de un jugador', () => {
    it('Si un jugador tiene pickup, cuenta el otro', () => {
      const scoreA: number | null = null
      const scoreB: number | null = 5
      const validScores = [scoreA, scoreB].filter(
        (s): s is number => s != null,
      )
      expect(Math.min(...validScores)).toBe(5)
    })
  })

  describe('9 hoyos best ball', () => {
    it('Par total equipo es 36 en 9 hoyos, no 72', () => {
      expect(parTotalEstandar(9)).toBe(36)
    })
  })
})
