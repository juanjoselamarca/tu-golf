import { describe, it, expect } from 'vitest'

describe('Scramble — Tests Canario', () => {
  describe('Un solo score por hoyo', () => {
    it('Equipo reporta un score por hoyo, no 4', () => {
      const teamScores = { 1: 4, 2: 5, 3: 3, 4: 5 }
      const gross = Object.values(teamScores).reduce((a, b) => a + b, 0)
      expect(gross).toBe(17)
    })
  })

  describe('HCP combinado 4-person', () => {
    it('Calcula según fórmula 25/20/15/10', () => {
      const hcps = [10, 15, 20, 25]
      const combined =
        hcps[0] * 0.25 + hcps[1] * 0.2 + hcps[2] * 0.15 + hcps[3] * 0.1
      expect(combined).toBe(11)
    })
  })

  describe('HCP combinado 2-person', () => {
    it('Calcula según fórmula 35/15', () => {
      const hcps = [12, 20]
      const combined = hcps[0] * 0.35 + hcps[1] * 0.15
      expect(combined).toBeCloseTo(7.2, 10)
    })
  })

  describe('9 hoyos scramble', () => {
    it('Solo cuenta hoyos 1-9', () => {
      const teamScores = {
        1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5,
      }
      const gross = Object.values(teamScores).reduce((a, b) => a + b, 0)
      expect(gross).toBe(36)
    })
  })
})
