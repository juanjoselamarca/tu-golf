import { describe, it, expect } from 'vitest'
import { inferHoles, parPerHoleArray } from './holes'

describe('inferHoles', () => {
  it('respeta holes_played cuando es 9 o 18', () => {
    expect(inferHoles({ holes_played: 18, scores: null })).toBe(18)
    expect(inferHoles({ holes_played: 9, scores: null })).toBe(9)
  })

  it('ignora holes_played con valor raro y cae a scores', () => {
    expect(inferHoles({ holes_played: 15, scores: [1,2,3,4,5,6,7,8,9] })).toBe(9)
    expect(inferHoles({ holes_played: 0, scores: new Array(18).fill(4) })).toBe(18)
  })

  it('infiere desde scores.length cuando holes_played es null', () => {
    expect(inferHoles({ holes_played: null, scores: [4,4,4,4,4,4,4,4,4] })).toBe(9)
    expect(inferHoles({ holes_played: null, scores: new Array(18).fill(4) })).toBe(18)
  })

  it('infiere desde Object.keys(scores) cuando scores es objeto', () => {
    const obj9: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) obj9[String(i)] = 4
    expect(inferHoles({ holes_played: null, scores: obj9 })).toBe(9)

    const obj18: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) obj18[String(i)] = 4
    expect(inferHoles({ holes_played: null, scores: obj18 })).toBe(18)
  })

  it('retorna null cuando no hay data suficiente', () => {
    expect(inferHoles({ holes_played: null, scores: null })).toBeNull()
    expect(inferHoles({ holes_played: undefined, scores: undefined })).toBeNull()
    expect(inferHoles({ holes_played: null, scores: [4,4,4] })).toBeNull()
    expect(inferHoles({ holes_played: null, scores: [4] })).toBeNull()
  })
})

/**
 * Tests del helper `parPerHoleArray` — protege contra bug P0 #1 detectado
 * por auditoría matemática 24-may-2026.
 *
 * BD guarda `par_per_hole` como JSONB objeto `{"1":4,...}`. Antes del fix,
 * código que casteaba a `number[]` directo (compute-plan-outcome,
 * dashboard/page.tsx) caía silenciosamente a fallbacks erróneos en canchas
 * par 71 (Los Leones, Sport Francés, Prince of Wales).
 */
describe('parPerHoleArray — normalización JSONB / array', () => {
  describe('JSONB objeto (shape real de BD)', () => {
    it('normaliza objeto 18 hoyos a array ordenado por número de hoyo', () => {
      const input = {
        '1': 4, '2': 4, '3': 3, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 5,
        '10': 4, '11': 4, '12': 3, '13': 4, '14': 5, '15': 4, '16': 3, '17': 4, '18': 5,
      }
      expect(parPerHoleArray(input)).toEqual(
        [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
      )
    })

    it('normaliza par 71 real (Los Leones — hoyo 9 par 4 en vez de par 5)', () => {
      const input = {
        '1': 4, '2': 4, '3': 3, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 4,
        '10': 4, '11': 4, '12': 3, '13': 4, '14': 5, '15': 4, '16': 3, '17': 4, '18': 5,
      }
      const out = parPerHoleArray(input)
      expect(out).not.toBeNull()
      expect(out!.reduce((a, b) => a + b, 0)).toBe(71) // par total correcto
      expect(out![8]).toBe(4) // hoyo 9 par 4 (no 5)
    })

    it('normaliza objeto 9 hoyos', () => {
      const input = { '1': 4, '2': 4, '3': 3, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 5 }
      expect(parPerHoleArray(input)).toEqual([4, 4, 3, 4, 5, 4, 3, 4, 5])
    })

    it('orden de keys no afecta resultado (JSONB no garantiza orden)', () => {
      const expected = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
      const desordenado: Record<string, number> = {}
      ;[18, 1, 9, 5, 12, 3, 7, 14, 2, 17, 10, 6, 11, 4, 8, 16, 13, 15].forEach((k) => {
        desordenado[String(k)] = expected[k - 1]
      })
      expect(parPerHoleArray(desordenado)).toEqual(expected)
    })
  })

  describe('Array legacy (compatibilidad)', () => {
    it('array 18 hoyos pasa through sin modificación', () => {
      const input = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
      expect(parPerHoleArray(input)).toEqual(input)
    })

    it('array 9 hoyos pasa through', () => {
      const input = [4, 4, 3, 4, 5, 4, 3, 4, 5]
      expect(parPerHoleArray(input)).toEqual(input)
    })
  })

  describe('Shapes inválidos devuelven null (no contaminan downstream)', () => {
    it('null/undefined → null', () => {
      expect(parPerHoleArray(null)).toBeNull()
      expect(parPerHoleArray(undefined)).toBeNull()
    })

    it('array de length incorrecta (12, 15, 20) → null', () => {
      expect(parPerHoleArray([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3])).toBeNull()
      expect(parPerHoleArray(Array(20).fill(4))).toBeNull()
    })

    it('objeto con keys no consecutivas (huecos) → null', () => {
      const huecos = { '1': 4, '3': 3, '5': 5, '7': 3, '9': 5, '11': 4, '13': 4, '15': 4, '17': 4 }
      expect(parPerHoleArray(huecos)).toBeNull()
    })

    it('objeto con valores fuera de rango par (par 7, par 0) → null', () => {
      const malo: Record<string, number> = {
        '1': 4, '2': 4, '3': 7, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 5,
        '10': 4, '11': 4, '12': 3, '13': 4, '14': 5, '15': 4, '16': 3, '17': 4, '18': 5,
      }
      expect(parPerHoleArray(malo)).toBeNull()
    })

    it('objeto con valores no numéricos (strings) → null', () => {
      const malo = {
        '1': 4, '2': '4', '3': 3, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 5,
        '10': 4, '11': 4, '12': 3, '13': 4, '14': 5, '15': 4, '16': 3, '17': 4, '18': 5,
      }
      expect(parPerHoleArray(malo as unknown as Record<string, number>)).toBeNull()
    })

    it('objeto con key fuera de 1..18 (key "0") → null', () => {
      const conKey0: Record<string, number> = {
        '0': 4, '1': 4, '2': 4, '3': 3, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 5,
        '10': 4, '11': 4, '12': 3, '13': 4, '14': 5, '15': 4, '16': 3, '17': 4,
      }
      expect(parPerHoleArray(conKey0)).toBeNull()
    })
  })
})
