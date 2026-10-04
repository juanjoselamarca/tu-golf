import { describe, it, expect } from 'vitest'
import {
  calcularMatchPlay,
  CONCEDE,
  hoyosNoJugadosDelMatch,
  hoyosSinTerminarDelMatch,
  resultadoDesdePerspectiva,
  scoresParaMatch,
} from './match-play'

const holes = [1, 2, 3, 4, 5].map(n => ({ numero: n, par: 4, stroke_index: n }))
const config = { courseHandicapA: 0, courseHandicapB: 0, totalHoles: 5, modo: 'gross' as const }
const match = (a: Record<string, number>, b: Record<string, number>) => calcularMatchPlay(a, b, holes, config)

describe('scoresParaMatch — fuente única de lo que entra al motor', () => {
  it('conserva scores ≥ 1 y los CONCEDE; descarta 0, negativos distintos de CONCEDE, null y no finitos', () => {
    expect(scoresParaMatch({ 1: 4, 2: CONCEDE, 3: 0, 4: -3, 5: null, 6: Number.NaN, 7: undefined })).toEqual({ '1': 4, '2': CONCEDE })
    expect(scoresParaMatch(null)).toEqual({})
  })

  it('un hoyo concedido SÍ cuenta en el match (antes las vistas lo filtraban con v > 0 y quedaba "Pendiente")', () => {
    const r = match(scoresParaMatch({ 1: CONCEDE }), scoresParaMatch({ 1: 4 }))
    expect(r.holes[0].result).toBe('conceded_a')
    expect(r.state).toBe(-1)
  })
})

describe('resultadoDesdePerspectiva — "Ganó / Perdió / Empate"', () => {
  it('match decidido antes: Ganó 3&2 para A, Perdió 3&2 para B', () => {
    const r = match({ 1: 3, 2: 3, 3: 3 }, { 1: 4, 2: 4, 3: 4 })
    expect(r.display).toBe('3&2')
    expect(resultadoDesdePerspectiva(r, 'a')).toBe('Ganó 3&2')
    expect(resultadoDesdePerspectiva(r, 'b')).toBe('Perdió 3&2')
  })

  it('ganado en el último hoyo: "1 UP"', () => {
    const r = match({ 1: 3, 2: 4, 3: 4, 4: 4, 5: 4 }, { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 })
    expect(resultadoDesdePerspectiva(r, 'b')).toBe('Perdió 1 UP')
  })

  it('todos empatados → "Empate" para ambos', () => {
    const iguales = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 }
    const r = match(iguales, iguales)
    expect(resultadoDesdePerspectiva(r, 'a')).toBe('Empate')
    expect(resultadoDesdePerspectiva(r, 'b')).toBe('Empate')
  })

  it('match que se dejó de anotar: "Sin terminar" con el estado desde cada lado', () => {
    const r = match({ 1: 3, 2: 3 }, { 1: 4, 2: 4 })
    expect(resultadoDesdePerspectiva(r, 'a')).toBe('Sin terminar (2 UP)')
    expect(resultadoDesdePerspectiva(r, 'b')).toBe('Sin terminar (2 DN)')
  })
})

describe('hoyos no jugados / sin terminar', () => {
  it('3&2 → los 2 últimos no se jugaron', () => {
    const r = match({ 1: 3, 2: 3, 3: 3 }, { 1: 4, 2: 4, 3: 4 })
    expect(hoyosNoJugadosDelMatch(r)).toEqual([4, 5])
  })

  it('sin terminar para cada jugador: los que le concedió el rival + los no jugados', () => {
    // B concede el 1 → A gana; A gana 2 y 3 → 3&2.
    const r = match({ 2: 3, 3: 3 }, { 1: CONCEDE, 2: 4, 3: 4 })
    expect(hoyosSinTerminarDelMatch(r, 'a')).toEqual([1, 4, 5])
    expect(hoyosSinTerminarDelMatch(r, 'b')).toEqual([4, 5])
  })
})
