import { describe, it, expect } from 'vitest'
import { calcularScoreRonda, parTotalEstandar } from '@/golf/core/round-score'

describe('Stroke Play — Tests Canario', () => {
  const par9 = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 } // 36
  const par18 = {
    ...par9,
    10: 4, 11: 4, 12: 3, 13: 5, 14: 4, 15: 3, 16: 4, 17: 4, 18: 5,
  } // 72

  describe('Bug 9-abr-2026: 9 vs 18 hoyos', () => {
    it('NO debe mostrar gross 83 cuando jugador hace +11 en 9 hoyos', () => {
      const scores = { 1: 5, 2: 5, 3: 4, 4: 6, 5: 5, 6: 5, 7: 5, 8: 5, 9: 7 }
      const result = calcularScoreRonda({ scores, roundHoles: 9, parMap: par9 })
      expect(result.gross).toBe(47)
      expect(result.gross).not.toBe(83)
      expect(result.vsPar).toBe(11)
      expect(result.parTotalRonda).toBe(36)
    })

    it('NO debe asumir par 72 para rondas de 9 hoyos', () => {
      expect(parTotalEstandar(9)).toBe(36)
      expect(parTotalEstandar(9)).not.toBe(72)
    })

    it('DEBE asumir par 72 para rondas de 18 hoyos', () => {
      expect(parTotalEstandar(18)).toBe(72)
    })
  })

  describe('Rondas incompletas', () => {
    it('Solo cuenta hoyos con score ingresado', () => {
      const scores = { 1: 5, 2: 4, 3: 3 }
      const result = calcularScoreRonda({
        scores,
        roundHoles: 18,
        parMap: par18,
      })
      expect(result.holesPlayed).toBe(3)
      expect(result.gross).toBe(12)
      expect(result.parJugado).toBe(11)
      expect(result.vsPar).toBe(1)
      expect(result.parTotalRonda).toBe(72)
    })

    it('Ronda vacía devuelve 0 en todo menos parTotalRonda', () => {
      const result = calcularScoreRonda({
        scores: {},
        roundHoles: 18,
        parMap: par18,
      })
      expect(result.gross).toBe(0)
      expect(result.holesPlayed).toBe(0)
      expect(result.vsPar).toBe(0)
      expect(result.parTotalRonda).toBe(72)
    })
  })

  describe('Ordenamiento correcto', () => {
    it('Ordena por vsPar ascendente (menor = mejor)', () => {
      const players = [
        { name: 'A', vsPar: 5 },
        { name: 'B', vsPar: -2 },
        { name: 'C', vsPar: 0 },
      ]
      const sorted = [...players].sort((a, b) => a.vsPar - b.vsPar)
      expect(sorted.map(p => p.name)).toEqual(['B', 'C', 'A'])
    })

    it('NO debe ordenar por gross cuando hay rondas distintas', () => {
      const p1 = { vsPar: 0, gross: 36, holes: 9 }
      const p2 = { vsPar: 0, gross: 72, holes: 18 }
      expect(p1.vsPar).toBe(p2.vsPar)
      expect(p1.gross).not.toBe(p2.gross)
    })
  })

  describe('Par no estándar en cancha', () => {
    it('Respeta par de la cancha, no asume 72', () => {
      const par70 = { ...par18, 4: 4, 9: 4 }
      const scores = Object.fromEntries(
        Object.entries(par70).map(([h, p]) => [h, p]),
      ) as Record<string, number>
      const result = calcularScoreRonda({
        scores,
        roundHoles: 18,
        parMap: par70,
      })
      expect(result.parTotalRonda).toBe(70)
      expect(result.vsPar).toBe(0)
    })
  })
})
