// #602 — Scramble / foursome: el scorer de grupo anota UNA tarjeta por equipo y juega
// el handicap del EQUIPO. THRU, hoyos faltantes, GOLPES y la fila de progreso tienen
// que salir de los equipos (antes salían de las tarjetas individuales, vacías: THRU 0,
// "¿Marcar 36 hoyos como par?", GOLPES del handicap de un jugador).
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useGrupoScoreboard } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useGrupoScoreboard'
import type { HoleData, Jugador } from '@/types/ronda'

const orden = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const parMap = Object.fromEntries(orden.map(h => [h, 4]))
const holeDataMap: Record<number, HoleData> = Object.fromEntries(orden.map(h => [h, { numero: h, par: 4, stroke_index: h, yardaje: null }]))
const jugadores = [
  { id: 'p1', nombre: 'Ana', user_id: null, scores: {} },
  { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  { id: 'p3', nombre: 'Carla', user_id: null, scores: {} },
  { id: 'p4', nombre: 'Diego', user_id: null, scores: {} },
] as unknown as Jugador[]
// Handicap INDIVIDUAL alto: si GOLPES saliera de los jugadores, el hoyo 6 (SI 6) daría golpe.
const playerHcp = { p1: 30, p2: 30, p3: 30, p4: 30 }
const equipos: Array<{ id: string; nombre: string; handicap_equipo: number | null; scores: Record<string, number> }> = [
  { id: 'e1', nombre: 'Cóndores', handicap_equipo: 10, scores: { '1': 5, '2': 4, '3': 6, '4': 5, '5': 4 } },
  { id: 'e2', nombre: 'Pumas', handicap_equipo: 6, scores: { '1': 4, '2': 4, '3': 5 } },
]

const montar = (formato: string, modo: string, currentHole: number, eqs = equipos) => renderHook(() => useGrupoScoreboard({
  ronda: { holes: 9, modo_juego: modo, formato_juego: formato } as never,
  jugadores, scores: {}, parMap, holeDataMap, playerHcp, equipos: eqs, ordenHoyos: orden, currentHole, isLastHole: currentHole === 9,
})).result.current

describe('useGrupoScoreboard — bola compartida (#602)', () => {
  it('THRU y hoyos faltantes salen de los equipos', () => {
    const b = montar('scramble', 'neto', 6)
    expect(b.maxThru).toBe(5)
    expect(b.totalMissingScores).toBe(4 + 6) // e1 le faltan 6-9, e2 4-9
    expect(b.hoyoCompleto(3)).toBe(true)
    expect(b.hoyoCompleto(4)).toBe(false) // e2 no lo anotó
  })

  it('GOLPES con el handicap del EQUIPO en 9h (mitad de 10 = 5 → SI 1-5), no el del jugador', () => {
    expect(montar('scramble', 'neto', 6).maxStrokesOnHole).toBe(0)
    expect(montar('scramble', 'neto', 5).maxStrokesOnHole).toBe(1)
    const b = montar('scramble', 'neto', 1)
    expect(b.hoyoConGolpe(5)).toBe(true)
    expect(b.hoyoConGolpe(6)).toBe(false)
  })

  it('gross: sin punto de golpe aunque el equipo tenga handicap', () => {
    expect(montar('scramble', 'gross', 1).hoyoConGolpe(1)).toBe(false)
  })

  it('totales del equipo con el motor del board', () => {
    const t = montar('foursome', 'neto', 6).totalesDeEquipo('e1')
    expect(t?.totalGross).toBe(24)
    expect(t?.overUnderGross).toBe(4)
    expect(t?.overUnderNeto).toBe(-1)
    expect(montar('scramble', 'neto', 6).totalesDeEquipo('nadie')).toBeNull()
  })

  it('formato individual: sigue con las tarjetas de los jugadores', () => {
    const b = renderHook(() => useGrupoScoreboard({
      ronda: { holes: 9, modo_juego: 'neto', formato_juego: 'stroke_play' } as never,
      jugadores, scores: { p1: { 1: 4, 2: 4 } }, parMap, holeDataMap, playerHcp, equipos: [], ordenHoyos: orden, currentHole: 6, isLastHole: false,
    })).result.current
    expect(b.maxThru).toBe(2)
    expect(b.totalMissingScores).toBe(7 + 9 * 3)
    expect(b.maxStrokesOnHole).toBe(3) // playerHcp ya es el CH que puntúa en la ronda: 30 en 9 hoyos = 3 por hoyo
    expect(b.totalesDeEquipo('e1')).toBeNull()
  })
})
