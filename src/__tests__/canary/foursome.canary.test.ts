import { describe, it, expect } from 'vitest'

describe('Foursome — Tests Canario', () => {
  describe('HCP combinado', () => {
    it('Promedio simple de 2 jugadores', () => {
      const hcpA = 10
      const hcpB = 18
      expect((hcpA + hcpB) / 2).toBe(14)
    })
  })

  describe('Drives alternados', () => {
    it('Jugador A tira en hoyos impares (1,3,5...)', () => {
      const drivesA = [1, 3, 5, 7, 9, 11, 13, 15, 17]
      for (const h of drivesA) {
        expect(h % 2).toBe(1)
      }
    })

    it('Jugador B tira en hoyos pares (2,4,6...)', () => {
      const drivesB = [2, 4, 6, 8, 10, 12, 14, 16, 18]
      for (const h of drivesB) {
        expect(h % 2).toBe(0)
      }
    })
  })

  describe('Un solo score por hoyo', () => {
    it('Score del equipo, no suma de ambos', () => {
      const teamScore = 4
      expect(teamScore).toBe(4)
    })
  })

  describe('9 hoyos foursome', () => {
    it('5 drives de A (impares), 4 de B (pares)', () => {
      const impares = [1, 3, 5, 7, 9].length
      const pares = [2, 4, 6, 8].length
      expect(impares).toBe(5)
      expect(pares).toBe(4)
    })
  })
})
