// src/lib/mi-golf/par.test.ts
import { describe, it, expect } from 'vitest'
import { getParForHoles, getVsPar } from './par'
import { inferHoles } from '@/golf/core/holes'

describe('getParForHoles', () => {
  it('retorna 36 para 9 hoyos', () => {
    expect(getParForHoles(9)).toBe(36)
  })

  it('retorna 36 para menos de 9 hoyos', () => {
    expect(getParForHoles(6)).toBe(36)
  })

  it('retorna 72 para 18 hoyos', () => {
    expect(getParForHoles(18)).toBe(72)
  })

  it('retorna 72 cuando holes_played es null', () => {
    expect(getParForHoles(null)).toBe(72)
  })

  it('retorna 72 cuando holes_played es undefined', () => {
    expect(getParForHoles(undefined)).toBe(72)
  })

  it('retorna 72 para más de 9 hoyos (criterio >=10 = 18)', () => {
    expect(getParForHoles(12)).toBe(72)
  })
})

describe('getVsPar', () => {
  it('calcula correctamente +2 para un 38 en 9 hoyos', () => {
    expect(getVsPar(38, 9)).toBe(2)
  })

  it('calcula correctamente +4 para un 76 en 18 hoyos', () => {
    expect(getVsPar(76, 18)).toBe(4)
  })

  it('evita el bug "38 -34 vs par" (9 hoyos correctamente clasificado)', () => {
    expect(getVsPar(38, 9)).not.toBe(-34)
    expect(getVsPar(38, 9)).toBe(2)
  })

  it('fallback a 18 hoyos cuando holes_played es null', () => {
    expect(getVsPar(82, null)).toBe(10)
  })

  it('retorna null cuando total_gross es null', () => {
    expect(getVsPar(null, 18)).toBeNull()
  })
})

/**
 * Par real opcional (cierra el bug P0 de la tarjeta OG): cuando se entrega
 * par_per_hole, getVsPar usa el par exacto de la cancha en vez del estimado.
 */
describe('getParForHoles / getVsPar con par real (par_per_hole)', () => {
  // Campo par 71 (front 9 = 36, back 9 = 35)
  const campo71: Record<string, number> = {
    '1': 4, '2': 4, '3': 3, '4': 4, '5': 5, '6': 4, '7': 3, '8': 4, '9': 5,
    '10': 4, '11': 4, '12': 3, '13': 4, '14': 4, '15': 4, '16': 3, '17': 4, '18': 5,
  }

  it('18 hoyos con par real → usa 71, no 72', () => {
    expect(getParForHoles(18, campo71)).toBe(71)
    expect(getVsPar(72, 18, campo71)).toBe(1) // 72 en par 71 = +1 (estimado daría Par)
  })

  it('9 hoyos con par real → solo front 9 (36), no los 18', () => {
    expect(getParForHoles(9, campo71)).toBe(36)
    // Sin par real, restar los 18 daría 45-71=-26; con par real 45-36=+9
    expect(getVsPar(45, 9, campo71)).toBe(9)
  })

  it('9 hoyos en campo cuyo front 9 no es 36 → par real exacto', () => {
    const campoFront35: Record<string, number> = {
      '1': 4, '2': 4, '3': 3, '4': 4, '5': 4, '6': 4, '7': 3, '8': 4, '9': 5, // 35
      '10': 4, '11': 4, '12': 3, '13': 4, '14': 5, '15': 4, '16': 3, '17': 4, '18': 4,
    }
    expect(getParForHoles(9, campoFront35)).toBe(35)
    expect(getVsPar(38, 9, campoFront35)).toBe(3) // estimado daría +2
  })

  it('par_per_hole inválido/ausente → cae al estimado (sin regresión)', () => {
    expect(getParForHoles(18, null)).toBe(72)
    expect(getParForHoles(9, undefined)).toBe(36)
    expect(getParForHoles(18, { '1': 4, '3': 4 })).toBe(72) // huecos → estimado
    expect(getVsPar(76, 18, null)).toBe(4)
  })

  /**
   * Caso real que rompía el fix original (blocker del code-review): ronda de 9
   * hoyos con holes_played NULL (≈68% de las rondas) + scores length 9. Sin
   * inferHoles, getVsPar(45, null, campo) sumaría los 18 → −26. Con inferHoles
   * resolviendo 9 desde scores, da el par del front-9 correcto.
   */
  it('ronda 9h con holes_played null + scores → par real del front-9 (vía inferHoles)', () => {
    const holes = inferHoles({ holes_played: null, scores: [5, 5, 5, 5, 5, 5, 5, 5, 5] })
    expect(holes).toBe(9)
    expect(getVsPar(45, holes, campo71)).toBe(9) // 45 − 36 (front-9), NO 45 − 71 = −26
  })

  it('ronda 18h con holes_played null + scores length 18 → par del campo completo', () => {
    const holes = inferHoles({ holes_played: null, scores: new Array(18).fill(4) })
    expect(holes).toBe(18)
    expect(getVsPar(72, holes, campo71)).toBe(1) // 72 en par 71 = +1
  })
})
