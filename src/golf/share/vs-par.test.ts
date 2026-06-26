import { describe, it, expect } from 'vitest'
import {
  parNominal,
  resolveParTotal,
  computeVsParGross,
  formatVsParLabel,
} from './vs-par'

describe('parNominal', () => {
  it('9 hoyos → 36, 18 hoyos → 72', () => {
    expect(parNominal(9)).toBe(36)
    expect(parNominal(18)).toBe(72)
  })
  it('null/undefined → 72 (asume 18)', () => {
    expect(parNominal(null)).toBe(72)
    expect(parNominal(undefined)).toBe(72)
  })
  it('valores <=9 → 36', () => {
    expect(parNominal(7)).toBe(36)
  })
})

describe('resolveParTotal', () => {
  it('par 71 real (Los Leones) desde JSONB objeto 18h', () => {
    const par71: Record<string, number> = {
      1: 4, 2: 3, 3: 4, 4: 5, 5: 4, 6: 4, 7: 3, 8: 4, 9: 5,
      10: 4, 11: 4, 12: 3, 13: 4, 14: 4, 15: 4, 16: 3, 17: 4, 18: 5,
    }
    const sum = Object.values(par71).reduce((a, b) => a + b, 0)
    expect(sum).toBe(71) // sanity del fixture
    const r = resolveParTotal({ holesPlayed: 18, parPerHole: par71 })
    expect(r).toEqual({ parTotal: 71, isRealPar: true })
  })

  it('par real desde array legacy de 9 hoyos', () => {
    const arr = [4, 3, 4, 5, 4, 4, 3, 4, 5] // 36
    const r = resolveParTotal({ holesPlayed: 9, parPerHole: arr })
    expect(r).toEqual({ parTotal: 36, isRealPar: true })
  })

  it('par real par-70 (no múltiplo de 72) se respeta', () => {
    const par70 = Array.from({ length: 18 }, (_, i) => (i === 0 ? 3 : 4)) // 3 + 17*4 = 71... ajusto
    // construir exactamente 70: 16 pares de 4 (64) + 2 de 3 (6) = 70
    const exact70 = [...Array(16).fill(4), 3, 3]
    expect(exact70.reduce((a, b) => a + b, 0)).toBe(70)
    void par70
    const r = resolveParTotal({ holesPlayed: 18, parPerHole: exact70 })
    expect(r).toEqual({ parTotal: 70, isRealPar: true })
  })

  it('snapshot 18h con ronda de 9h → NO usa snapshot, cae a nominal 36', () => {
    const par18 = Array(18).fill(4) // 72
    const r = resolveParTotal({ holesPlayed: 9, parPerHole: par18 })
    expect(r).toEqual({ parTotal: 36, isRealPar: false })
  })

  it('par_per_hole ausente → nominal por holesPlayed', () => {
    expect(resolveParTotal({ holesPlayed: 18, parPerHole: null })).toEqual({ parTotal: 72, isRealPar: false })
    expect(resolveParTotal({ holesPlayed: 9, parPerHole: undefined })).toEqual({ parTotal: 36, isRealPar: false })
  })

  it('par_per_hole con huecos (inválido) → nominal', () => {
    const huecos: Record<string, number> = { 1: 4, 3: 4 }
    const r = resolveParTotal({ holesPlayed: 18, parPerHole: huecos })
    expect(r.isRealPar).toBe(false)
    expect(r.parTotal).toBe(72)
  })

  it('holesPlayed null pero snapshot válido → infiere hoyos del largo', () => {
    const par9 = [4, 3, 4, 5, 4, 4, 3, 4, 5] // 36, length 9
    const r = resolveParTotal({ holesPlayed: null, parPerHole: par9 })
    expect(r).toEqual({ parTotal: 36, isRealPar: true })
  })
})

describe('computeVsParGross', () => {
  it('gross 75 en par 71 → +4', () => {
    expect(computeVsParGross(75, 71)).toBe(4)
  })
  it('gross 70 en par 72 → -2', () => {
    expect(computeVsParGross(70, 72)).toBe(-2)
  })
  it('gross igual al par → 0', () => {
    expect(computeVsParGross(71, 71)).toBe(0)
  })
})

describe('formatVsParLabel', () => {
  it('0 → "Par"', () => {
    expect(formatVsParLabel(0)).toBe('Par')
  })
  it('positivo → "+N"', () => {
    expect(formatVsParLabel(4)).toBe('+4')
  })
  it('negativo → "-N"', () => {
    expect(formatVsParLabel(-2)).toBe('-2')
  })
})
