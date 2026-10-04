import { describe, it, expect } from 'vitest'
import { handicapQueJuega } from './rules'
import { calcularResumenRonda } from './scoring'
import { HOYOS_LEONES, TARJETAS_LEONES, PUNTOS_ESPERADOS_LEONES, PAR_LEONES } from './__fixtures__/los-leones'

describe('handicapQueJuega — fuente única de golpes que reparte la modalidad', () => {
  it('gross anula el handicap (también el plus)', () => {
    expect(handicapQueJuega('gross', 21)).toBe(0)
    expect(handicapQueJuega('gross', -2)).toBe(0)
  })
  it('neto conserva el course handicap', () => {
    expect(handicapQueJuega('neto', 21)).toBe(21)
  })
  it('modo null/desconocido conserva el comportamiento previo', () => {
    expect(handicapQueJuega(null, 14)).toBe(14)
    expect(handicapQueJuega(undefined, 14)).toBe(14)
  })
})

describe('Stableford gross Los Leones — motor (calcularResumenRonda)', () => {
  const pts = (scores: Record<string, number>, ch: number) =>
    calcularResumenRonda(scores, HOYOS_LEONES, handicapQueJuega('gross', ch), 72, 18).totalStableford

  it.each(['A', 'B', 'C', 'D'] as const)('fixture %s', k => {
    expect(pts(TARJETAS_LEONES[k], 0)).toBe(PUNTOS_ESPERADOS_LEONES[k])
  })

  it('índice 18 (CH 21) saca EXACTAMENTE lo mismo que sin índice, en las 4 tarjetas', () => {
    for (const k of ['A', 'B', 'C', 'D'] as const) {
      expect(pts(TARJETAS_LEONES[k], 21)).toBe(pts(TARJETAS_LEONES[k], 0))
    }
  })

  it('pickup en el hoyo 1 de C (anotado como par+2) → 26', () => {
    expect(pts({ ...TARJETAS_LEONES.C, '1': PAR_LEONES[1] + 2 }, 0)).toBe(26)
  })

  it('albatros = 5, eagle = 4 (tabla R&A en gross)', () => {
    expect(pts({ '4': 2 }, 0)).toBe(5) // par 5 en 2
    expect(pts({ '4': 3 }, 0)).toBe(4) // par 5 en 3
  })
})
