import { describe, it, expect } from 'vitest'
import { tarjetaParaHistorial } from './tarjeta-para-historial'
import { CONCEDE } from '@/golf/formats/match-play'

const ronda = {
  formato_juego: 'match_play' as const, holes: 3, modo_juego: 'gross' as const, hoyo_inicio: 1,
  ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana' }, { id: 'p2', nombre: 'Beto' }],
}
const base = {
  ronda, jugadorId: 'p2', hoyos: [1, 2, 3], parMap: { 1: 4, 2: 4, 3: 4 },
  hoyosConSi: [1, 2, 3].map(n => ({ numero: n, par: 4, stroke_index: n })),
  courseHcpPorJugador: { p1: 0, p2: 0 }, sinIndice: new Set<string>(),
}
// Beto concede el 1 (Ana 4) y empatan 2 y 3 → Ana gana 1 UP.
const scoresPorJugador = { p1: { 1: 4, 2: 4, 3: 4 }, p2: { 1: CONCEDE, 2: 4, 3: 4 } }

describe('tarjetaParaHistorial — correcciones', () => {
  it('corregir el hoyo concedido cambia la tarjeta del índice pero NO el resultado del match', () => {
    const sin = tarjetaParaHistorial({ ...base, scores: scoresPorJugador.p2, scoresPorJugador })
    expect(sin.matchResult).toBe('Perdió 1 UP')
    expect(sin.scores[1]).toBe(5)
    const con = tarjetaParaHistorial({ ...base, scores: scoresPorJugador.p2, scoresPorJugador, correcciones: { 1: 4 } })
    expect(con.matchResult).toBe('Perdió 1 UP') // con el 4 corregido sería empate: no debe pasar
    expect(con.scores[1]).toBe(4)
    expect(con.estimados).toEqual([])
  })

  it('una corrección sobre un hoyo que no es estimado se ignora (lo anotado en cancha manda)', () => {
    const r = tarjetaParaHistorial({ ...base, scores: scoresPorJugador.p2, scoresPorJugador, correcciones: { 2: 9 } })
    expect(r.scores[2]).toBe(4)
  })

  it('fuera de match play la tarjeta pasa tal cual', () => {
    const r = tarjetaParaHistorial({ ...base, ronda: { ...ronda, formato_juego: 'stroke_play' as const }, scores: { 1: 5 }, scoresPorJugador: {} })
    expect(r).toEqual({ scores: { 1: 5 }, matchResult: null, estimados: [] })
  })
})
