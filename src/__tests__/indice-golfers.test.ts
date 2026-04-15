import { describe, it, expect } from 'vitest'
import {
  calcularDiferencial,
  calcularIndiceGolfersLocal,
  calcularNivel,
  rondasParaActivar,
  NIVEL_LABELS,
} from '../lib/indice-golfers'

describe('calcularDiferencial — 18 hoyos', () => {
  it('scratch round on standard course → 0', () => {
    expect(calcularDiferencial(72, 72, 113)).toBe(0)
  })

  it('standard formula: (gross - CR) × 113 / slope', () => {
    // 80 - 72 = 8, × 113 / 113 = 8.0
    expect(calcularDiferencial(80, 72, 113)).toBe(8)
  })

  it('adjusts for non-standard slope', () => {
    // 80 - 72 = 8, × 113 / 130 = 6.95
    const diff = calcularDiferencial(80, 72, 130)
    expect(diff).toBeCloseTo(6.95, 1)
  })

  it('returns null for missing slope', () => {
    expect(calcularDiferencial(80, 72, 0)).toBeNull()
  })

  it('returns null for missing course rating on 18 holes', () => {
    expect(calcularDiferencial(80, 0, 113)).toBeNull()
  })

  it('low gross without holes_played is treated as 9-hole round (inferred)', () => {
    // Score 55 no puede ser 18h (ni un pro tira < 60). Auto-inferir 9h.
    // (55 - 36) × 113 / 113 × 2 = 38 — diferencial equivalente a 18h.
    expect(calcularDiferencial(55, 72, 113)).toBe(38)
  })
})

describe('calcularDiferencial — 9 hoyos', () => {
  it('uses 9-hole ratings when available (scaled to 18h equivalent)', () => {
    const diff = calcularDiferencial(40, 72, 113, 9, { cr9h: 36, slope9h: 113 })
    // 9h SD = (40 - 36) × 113 / 113 = 4
    // equivalente 18h = 4 × 2 = 8 (para comparar con diffs de 18h en el índice)
    expect(diff).toBe(8)
  })

  it('falls back to half of 18-hole CR (scaled to 18h equivalent)', () => {
    const diff = calcularDiferencial(40, 72, 113, 9)
    // Fallback: cr9 = 72/2 = 36, slope9 = 113
    // SD 9h = (40 - 36) × 113 / 113 = 4 → ×2 = 8
    expect(diff).toBe(8)
  })

  it('returns null for 9 holes without CR', () => {
    expect(calcularDiferencial(40, 0, 113, 9)).toBeNull()
  })
})

describe('calcularIndiceGolfersLocal', () => {
  it('returns null with < 3 rounds', () => {
    expect(calcularIndiceGolfersLocal([])).toBeNull()
    expect(calcularIndiceGolfersLocal([5, 6])).toBeNull()
  })

  it('with 3 rounds, uses best 1 × 0.96', () => {
    const idx = calcularIndiceGolfersLocal([10, 12, 15])!
    expect(idx).toBeCloseTo(10 * 0.96, 1) // best 1 = 10
  })

  it('with 7 rounds, uses best 2 × 0.96', () => {
    const diffs = [10, 12, 8, 15, 11, 9, 14]
    const idx = calcularIndiceGolfersLocal(diffs)!
    // sorted: [8, 9, 10, 11, 12, 14, 15], best 2 = [8, 9], avg = 8.5
    expect(idx).toBeCloseTo(8.5 * 0.96, 1)
  })

  it('with 20 rounds, uses best 8 × 0.96', () => {
    const diffs = Array.from({ length: 20 }, (_, i) => 5 + i)
    const idx = calcularIndiceGolfersLocal(diffs)!
    // sorted: [5,6,7,8,9,10,11,12,...], best 8 = [5,6,7,8,9,10,11,12], avg = 8.5
    expect(idx).toBeCloseTo(8.5 * 0.96, 1)
  })

  it('always applies 0.96 multiplier', () => {
    const idx = calcularIndiceGolfersLocal([10, 10, 10])!
    expect(idx).toBe(9.6)
  })

  it('returns number with 1 decimal', () => {
    const idx = calcularIndiceGolfersLocal([10.123, 10.456, 10.789])!
    expect(String(idx).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1)
  })
})

describe('calcularNivel', () => {
  it('level 1 (Rookie) for 0-1 rounds', () => {
    expect(calcularNivel(0)).toBe(1)
    expect(calcularNivel(1)).toBe(1)
  })

  it('level 2 (En Cancha) for 2-5 rounds', () => {
    expect(calcularNivel(2)).toBe(2)
    expect(calcularNivel(5)).toBe(2)
  })

  it('level 3 (Jugador Activo) for 6-11 rounds', () => {
    expect(calcularNivel(6)).toBe(3)
    expect(calcularNivel(11)).toBe(3)
  })

  it('level 4 (Scratch+) for 12-19 rounds', () => {
    expect(calcularNivel(12)).toBe(4)
    expect(calcularNivel(19)).toBe(4)
  })

  it('level 5 (Golfer+) for 20+ rounds', () => {
    expect(calcularNivel(20)).toBe(5)
    expect(calcularNivel(100)).toBe(5)
  })

  it('NIVEL_LABELS has all 5 levels', () => {
    for (let i = 1; i <= 5; i++) {
      expect(NIVEL_LABELS[i]).toBeDefined()
    }
  })
})

describe('rondasParaActivar', () => {
  it('needs 3 rounds with 0 played', () => {
    expect(rondasParaActivar(0)).toBe(3)
  })

  it('needs 1 more with 2 played', () => {
    expect(rondasParaActivar(2)).toBe(1)
  })

  it('returns 0 when already sufficient', () => {
    expect(rondasParaActivar(3)).toBe(0)
    expect(rondasParaActivar(20)).toBe(0)
  })
})
