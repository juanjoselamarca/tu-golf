import { describe, it, expect } from 'vitest'
import { golpesAReintentar, hayEquipoTerminadoConApartados } from './apartados-del-envio'

describe('golpesAReintentar', () => {
  it('sólo tarjetas vigentes y sin los hoyos con un valor pendiente más nuevo', () => {
    const rech = { p1: { 3: 5, 4: 6 }, 'eq:A': { 7: 4 }, fuera: { 1: 3 } }
    const pend = { p1: { 4: 5 } }
    expect(golpesAReintentar(rech, pend, new Set(['p1', 'eq:A']))).toEqual([['p1', { 3: 5 }], ['eq:A', { 7: 4 }]])
  })
  it('una tarjeta cuyos hoyos están todos pendientes no se reenvía', () => {
    expect(golpesAReintentar({ p1: { 3: 5 } }, { p1: { 3: 4 } }, new Set(['p1']))).toEqual([])
  })
})

describe('hayEquipoTerminadoConApartados', () => {
  it('equipo terminado, vigente y con apartados: frena', () => {
    expect(hayEquipoTerminadoConApartados(new Set(['eq:A']), new Set(['eq:A']), { 'eq:A': { 7: 4 } })).toBe(true)
  })
  it('sin apartados, o ya fuera de la pantalla (otro equipo de este celular que ya terminó): no frena', () => {
    expect(hayEquipoTerminadoConApartados(new Set(['eq:A']), new Set(['eq:A']), {})).toBe(false)
    expect(hayEquipoTerminadoConApartados(new Set(['eq:A']), new Set(['eq:B']), { 'eq:A': { 7: 4 } })).toBe(false)
    expect(hayEquipoTerminadoConApartados(new Set(), new Set(['eq:A']), { 'eq:A': { 7: 4 } })).toBe(false)
  })
})
