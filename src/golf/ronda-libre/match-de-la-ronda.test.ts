import { describe, it, expect } from 'vitest'
import { CONCEDE } from '@/golf/formats/match-play'
import { hoyosSinTerminarDeJugador, matchDeLaRonda } from './match-de-la-ronda'

const hoyos = [1, 2, 3].map(n => ({ numero: n, par: 4, stroke_index: n }))
const ronda = (extra: Record<string, unknown> = {}) => ({
  formato_juego: 'match_play' as const, holes: 3, modo_juego: 'neto' as const, hoyo_inicio: 1,
  ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana' }, { id: 'p2', nombre: 'Beto' }],
  ...extra,
})
const hcp = { p1: 0, p2: 0 }

describe('matchDeLaRonda — el mismo match en scorer, vista en vivo e historial', () => {
  it('no es match play, falta un jugador o no hay hoyos → null', () => {
    expect(matchDeLaRonda({ ronda: ronda({ formato_juego: 'stroke_play' }), scoresPorJugador: {}, hoyos, courseHcpPorJugador: hcp })).toBeNull()
    expect(matchDeLaRonda({ ronda: ronda({ ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana' }] }), scoresPorJugador: {}, hoyos, courseHcpPorJugador: hcp })).toBeNull()
    expect(matchDeLaRonda({ ronda: ronda(), scoresPorJugador: {}, hoyos: [], courseHcpPorJugador: hcp })).toBeNull()
    expect(matchDeLaRonda({ ronda: ronda(), scoresPorJugador: {}, hoyos, courseHcpPorJugador: hcp, perspectivaId: 'x' })).toBeNull()
  })

  it('cuenta los hoyos concedidos aunque la tarjeta venga cruda de la base (claves string)', () => {
    const r = matchDeLaRonda({ ronda: ronda(), scoresPorJugador: { p1: { '1': CONCEDE }, p2: { '1': 4 } }, hoyos, courseHcpPorJugador: hcp })
    expect(r?.holes[0].result).toBe('conceded_a')
  })

  it('la perspectiva pone al jugador como A', () => {
    const scoresPorJugador = { p1: { 1: 3, 2: 3 }, p2: { 1: 4, 2: 4 } }
    expect(matchDeLaRonda({ ronda: ronda(), scoresPorJugador, hoyos, courseHcpPorJugador: hcp })?.state).toBe(2)
    expect(matchDeLaRonda({ ronda: ronda(), scoresPorJugador, hoyos, courseHcpPorJugador: hcp, perspectivaId: 'p2' })?.state).toBe(-2)
  })

  it('modo neto: reparte la diferencia de course handicap de scoring', () => {
    // Beto recibe 3 (1 por hoyo en 3 hoyos): 4 bruto = 3 neto, empata con Ana.
    const r = matchDeLaRonda({ ronda: ronda(), scoresPorJugador: { p1: { 1: 3, 2: 3, 3: 3 }, p2: { 1: 4, 2: 4, 3: 4 } }, hoyos, courseHcpPorJugador: { p1: 0, p2: 3 } })
    expect(r?.holesHalved).toBe(3)
  })
})

describe('hoyosSinTerminarDeJugador', () => {
  it('mapea cada jugador a su lado del match; fuera del match, ninguno', () => {
    const jugadores = ronda().ronda_libre_jugadores
    const m = matchDeLaRonda({ ronda: ronda(), scoresPorJugador: { p1: { 1: 3, 2: 3 }, p2: { 1: 4, 2: 4 } }, hoyos, courseHcpPorJugador: hcp })
    expect(hoyosSinTerminarDeJugador(m, jugadores, 'p1')).toEqual([3])
    expect(hoyosSinTerminarDeJugador(m, jugadores, 'p2')).toEqual([3])
    expect(hoyosSinTerminarDeJugador(m, jugadores, 'otro')).toEqual([])
    expect(hoyosSinTerminarDeJugador(null, jugadores, 'p1')).toEqual([])
  })
})
