// src/lib/mi-golf/par.test.ts
import { describe, it, expect } from 'vitest'
import { getParForHoles, getVsPar } from './par'

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
