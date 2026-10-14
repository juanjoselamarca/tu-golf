import { describe, it, expect } from 'vitest'
import { MIN_HOYOS_JUGADOS_SCORE_9 } from '@/golf/core/ajuste-whs'
import {
  calcularDiferencial,
  calcularNivel,
  rondasParaActivar,
  NIVEL_LABELS,
  diferencialDeTarjeta,
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

describe('diferencialDeTarjeta — decisión única de los dos finalizadores', () => {
  const ratings = { slope: 128, cr: 71.3, nineHole: null }
  it('18 hoyos con ratings: (gross − CR) × 113 / slope', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 90, holesPlayed: 18, ratings, bolaCompartida: false })).toBeCloseTo(16.51, 2)
  })
  it('sin slope o CR → null', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 90, holesPlayed: 18, ratings: { slope: null, cr: 71.3, nineHole: null }, bolaCompartida: false })).toBeNull()
    expect(diferencialDeTarjeta({ grossAjustado: 90, holesPlayed: 18, ratings: { slope: 128, cr: null, nineHole: null }, bolaCompartida: false })).toBeNull()
  })
  it('menos de 9 hoyos → null; 9 justos sí (con rating de 9 de la mitad jugada)', () => {
    expect(MIN_HOYOS_JUGADOS_SCORE_9).toBe(9)
    expect(diferencialDeTarjeta({ grossAjustado: 40, holesPlayed: 8, ratings, bolaCompartida: false })).toBeNull()
    const con9 = diferencialDeTarjeta({ grossAjustado: 45, holesPlayed: 9, ratings: { ...ratings, nineHole: { cr9h: 35.7, slope9h: 130 } }, bolaCompartida: false })
    expect(con9).toBeCloseTo(((45 - 35.7) * 113 / 130) * 2, 2)
  })
  it('scramble / foursome (bola compartida) → null aunque haya ratings', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 80, holesPlayed: 18, ratings, bolaCompartida: true })).toBeNull()
  })
})

describe('diferencialDeTarjeta — hoyos estimados por no jugarse (WHS 2.2)', () => {
  const ratings = { slope: 128, cr: 71.3, nineHole: { cr9h: 35.6, slope9h: 126 } }
  it('match de 9 decidido 5&4 (4 hoyos a par neto): sin diferencial', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 40, holesPlayed: 9, hoyosNoJugados: 4, ratings, bolaCompartida: false })).toBeNull()
  })
  it('los mismos 9 hoyos todos jugados: con diferencial', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 40, holesPlayed: 9, hoyosNoJugados: 0, ratings, bolaCompartida: false })).not.toBeNull()
  })
  it('match de 18 decidido 4&3 (15 jugados ≥ 10): con diferencial', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 85, holesPlayed: 18, hoyosNoJugados: 3, ratings, bolaCompartida: false })).not.toBeNull()
  })
})

describe('diferencialDeTarjeta — tarjetas incompletas (WHS 3.3 / 5.1b, #545 revisión 1)', () => {
  const ratings = { slope: 128, cr: 71.3, nineHole: null }
  it('12 hoyos jugados sin estimados: tarjeta a medias, sin diferencial (antes: bruto de 12 como de 18)', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 60, holesPlayed: 12, ratings, bolaCompartida: false })).toBeNull()
    expect(diferencialDeTarjeta({ grossAjustado: 85, holesPlayed: 17, hoyosNoJugados: 0, ratings, bolaCompartida: false })).toBeNull()
  })
  it('la ronda libre que completa sus hoyos con estimados (holesPlayed = tarjeta) no cambia', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 85, holesPlayed: 18, hoyosNoJugados: 3, ratings, bolaCompartida: false })).not.toBeNull()
    expect(diferencialDeTarjeta({ grossAjustado: 85, holesPlayed: 18, ratings, bolaCompartida: false, hoyosJugados: Array.from({ length: 18 }, (_, i) => i + 1) })).not.toBeNull()
  })
  it('9 hoyos de una mitad (front o back) sí; 9 sueltos de las dos mitades no', () => {
    const base = { grossAjustado: 45, holesPlayed: 9, ratings, bolaCompartida: false }
    expect(diferencialDeTarjeta({ ...base, hoyosJugados: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).not.toBeNull()
    expect(diferencialDeTarjeta({ ...base, hoyosJugados: [10, 11, 12, 13, 14, 15, 16, 17, 18] })).not.toBeNull()
    expect(diferencialDeTarjeta({ ...base, hoyosJugados: [1, 2, 3, 4, 5, 10, 11, 12, 13] })).toBeNull()
    // Sin golpes por hoyo no se juzga qué hoyos fueron (como antes).
    expect(diferencialDeTarjeta({ ...base, hoyosJugados: null })).not.toBeNull()
    // Lista vacía: nada que juzgar, no es "disperso" (revisión 2 P2-b).
    expect(diferencialDeTarjeta({ ...base, hoyosJugados: [] })).not.toBeNull()
  })
  it('tarjeta de 15 casillas con 3 no jugados: sigue a medias (los estimados llevan golpes; una completa trae 18) — revisión 2 P2-a', () => {
    expect(diferencialDeTarjeta({ grossAjustado: 75, holesPlayed: 15, hoyosNoJugados: 3, ratings, bolaCompartida: false })).toBeNull()
    expect(diferencialDeTarjeta({ grossAjustado: 85, holesPlayed: 18, hoyosNoJugados: 3, ratings, bolaCompartida: false })).not.toBeNull()
  })
})
