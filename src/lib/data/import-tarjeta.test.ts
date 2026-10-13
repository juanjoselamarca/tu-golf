import { describe, it, expect } from 'vitest'
import { parDelCatalogoPorPosicion } from './import-tarjeta'

const PAR18: Record<number, number> = { 1: 5, 2: 4, 3: 3, 4: 4, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 3, 11: 4, 12: 4, 13: 5, 14: 3, 15: 4, 16: 4, 17: 5, 18: 4 }
const catalogo18 = Object.entries(PAR18).map(([n, par]) => ({ numero: Number(n), par, stroke_index: Number(n) }))
const del1 = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const back = [10, 11, 12, 13, 14, 15, 16, 17, 18]

describe('parDelCatalogoPorPosicion — par del catálogo en las posiciones de la tarjeta (#545)', () => {
  it('tarjeta de 18 desde el 1: posición = número de hoyo', () => {
    expect(parDelCatalogoPorPosicion(catalogo18, del1(18))).toEqual(Object.fromEntries(del1(18).map(n => [String(n), PAR18[n]])))
  })

  it('back 9: la posición 1 lleva el par del hoyo 10, no el del 1', () => {
    const par = parDelCatalogoPorPosicion(catalogo18, back)!
    expect(par['1']).toBe(3)
    expect(Object.keys(par)).toHaveLength(9)
  })

  it('catálogo ambiguo (dos recorridos repiten el hoyo 1): null, nunca un par de otro recorrido', () => {
    const otroRecorrido = { numero: 1, par: 3, stroke_index: 1 }
    expect(parDelCatalogoPorPosicion([...catalogo18, otroRecorrido], del1(18))).toBeNull()
  })

  it('cancha de 9 y tarjeta del back 9: la segunda vuelta repite los hoyos 1..9', () => {
    const catalogo9 = catalogo18.slice(0, 9)
    const par = parDelCatalogoPorPosicion(catalogo9, back)!
    expect(Object.keys(par)).toHaveLength(9)
    expect(par['1']).toBe(PAR18[1])
    expect(par['9']).toBe(PAR18[9])
  })

  it('cancha de 9 jugada en 18: los 18 con par (no queda a medias)', () => {
    const par = parDelCatalogoPorPosicion(catalogo18.slice(0, 9), del1(18))!
    expect(Object.keys(par)).toHaveLength(18)
    expect(par['10']).toBe(PAR18[1])
  })

  it('catálogo vacío: null', () => {
    expect(parDelCatalogoPorPosicion([], del1(18))).toBeNull()
  })
})
