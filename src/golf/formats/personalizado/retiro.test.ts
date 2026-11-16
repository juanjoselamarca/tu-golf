import { describe, it, expect } from 'vitest'
import { estaRetiradoEn, hoyosNoJugadosPorRetiro, hoyoDesdeElQueSeRetira, hoyosParaElegirElRetiro, golpesHastaElRetiro, tieneGolpesDesde } from './retiro'

// Salida en el 10: el orden de juego es 10..18, 1..9 (spec, "Hoyo pendiente y retiro").
const ORDEN = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]

describe('retiro de un jugador (orden de juego, no número de hoyo)', () => {
  it('sin retiro no está retirado en ningún hoyo', () => {
    expect(ORDEN.some(h => estaRetiradoEn(undefined, h, ORDEN))).toBe(false)
    expect(hoyosNoJugadosPorRetiro(null, ORDEN)).toEqual([])
  })
  it('retirado desde el 17: pierde 17, 18 y 1..9, no el 16', () => {
    expect(estaRetiradoEn(17, 16, ORDEN)).toBe(false)
    expect(estaRetiradoEn(17, 17, ORDEN)).toBe(true)
    expect(estaRetiradoEn(17, 1, ORDEN)).toBe(true)
    expect(hoyosNoJugadosPorRetiro(17, ORDEN)).toEqual([17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('un retiro desde un hoyo que no está en la ronda se ignora (cláusula 9)', () => {
    const nueve = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(estaRetiradoEn(12, 5, nueve)).toBe(false)
    expect(hoyosNoJugadosPorRetiro(12, nueve)).toEqual([])
  })
  it('se retira desde el primer hoyo sin score a partir del actual', () => {
    expect(hoyoDesdeElQueSeRetira({ 10: 4, 11: 5 }, 12, ORDEN)).toBe(12)
    // Ya anotó el hoyo en que está: se retira desde el siguiente.
    expect(hoyoDesdeElQueSeRetira({ 10: 4, 11: 5, 12: 4 }, 12, ORDEN)).toBe(13)
    // Último hoyo ya anotado: no queda ninguno que perder.
    const todos = Object.fromEntries(ORDEN.map(h => [h, 4]))
    expect(hoyoDesdeElQueSeRetira(todos, 9, ORDEN)).toBeNull()
  })
})

describe('hoyos para elegir desde cuál se retira (se acordaron tarde)', () => {
  it('de la salida hasta el hoyo actual, en orden de juego', () => {
    expect(hoyosParaElegirElRetiro(ORDEN, 12, 12)).toEqual([10, 11, 12])
  })
  it('incluye el calculado si quedó después del actual (ya anotó el actual)', () => {
    expect(hoyosParaElegirElRetiro(ORDEN, 12, 13)).toEqual([10, 11, 12, 13])
  })
  it('hoyo fuera de la ronda: hasta el calculado, o nada', () => {
    expect(hoyosParaElegirElRetiro(ORDEN, 99, null)).toEqual([])
    expect(hoyosParaElegirElRetiro([1, 2, 3], 99, 2)).toEqual([1, 2])
  })
})

describe('golpes hasta el retiro (la tarjeta del historial no lleva lo anotado después)', () => {
  it('quita los golpes desde el hoyo del retiro en orden de juego, sin tocar los anteriores', () => {
    const scores = { 10: 4, 11: 5, 12: 3, 17: 6, 18: 4, 1: 5 }
    expect(golpesHastaElRetiro(scores, 17, ORDEN)).toEqual({ 10: 4, 11: 5, 12: 3 })
  })
  it('sin retiro (o retiro fuera de la ronda) devuelve los mismos golpes', () => {
    const scores = { 10: 4, 11: 5 }
    expect(golpesHastaElRetiro(scores, null, ORDEN)).toBe(scores)
    expect(golpesHastaElRetiro(scores, 99, ORDEN)).toBe(scores)
  })
  it('acepta claves de texto (tarjeta como viene del servidor)', () => {
    expect(golpesHastaElRetiro({ '10': 4, '11': 5 }, 11, ORDEN)).toEqual({ '10': 4 })
  })
})

describe('tiene golpes desde un hoyo (en orden de juego)', () => {
  it('true si anotó ese hoyo o uno posterior en el orden de juego', () => {
    expect(tieneGolpesDesde({ 10: 4, 11: 5, 1: 4 }, 18, ORDEN)).toBe(true) // el 1 se juega después del 18
    expect(tieneGolpesDesde({ 10: 4, 11: 5 }, 11, ORDEN)).toBe(true)
    expect(tieneGolpesDesde({ 10: 4, 11: 5 }, 12, ORDEN)).toBe(false)
    expect(tieneGolpesDesde(undefined, 10, ORDEN)).toBe(false)
  })
})
