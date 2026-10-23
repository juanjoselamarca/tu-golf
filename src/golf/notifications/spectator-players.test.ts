/**
 * buildSpectatorPlayers — el cliente arma el aviso con la misma fuente que el
 * servidor: en bola compartida el puntaje vive en ronda_equipos (review PR #634, I-1).
 */
import { describe, it, expect } from 'vitest'
import { buildSpectatorPlayers } from './spectator-players'
import { shouldNotifySpectators } from './spectator'

const parMap: Record<number, number> = { 1: 4, 2: 4, 3: 3, 4: 4, 5: 5, 6: 4, 7: 3, 8: 4, 9: 5 }
const siMap: Record<number, number> = Object.fromEntries(Object.keys(parMap).map(k => [k, Number(k)]))
const eq = (id: string, nombre: string, scores: Record<string, number>) => ({ id, nombre, handicap_equipo: 0, jugadorIds: [], scores })

describe('buildSpectatorPlayers', () => {
  it('scramble en el hoyo 3 con jugadores SIN scores individuales → el aviso ve el puntaje del equipo y sí avisa', () => {
    const players = buildSpectatorPlayers({
      formato: 'scramble', modo: 'gross', totalHoles: 9, hoyoInicio: 1,
      leaderboard: [{ nombre: 'Alberto Chadwick', vsPar: 0, holesPlayed: 0 }, { nombre: 'Papa', vsPar: 0, holesPlayed: 0 }],
      equipos: [eq('a', 'Los Tigres', { '1': 4, '2': 5, '3': 2 })],
      parMap, siMap,
    })
    expect(players).toEqual([{ nombre: 'Los Tigres', vsPar: 0, holesCompleted: 3, totalHoles: 9 }])
    expect(shouldNotifySpectators(players, false)).toBe(true)
  })

  it('scramble recién creado (equipo sin scores) → no avisa', () => {
    const players = buildSpectatorPlayers({
      formato: 'foursome', modo: 'neto', totalHoles: 9, hoyoInicio: 1,
      leaderboard: [{ nombre: 'Alberto Chadwick', vsPar: 0, holesPlayed: 0 }],
      equipos: [eq('a', 'Dúo Uno', {})],
      parMap, siMap,
    })
    expect(players).toEqual([{ nombre: 'Dúo Uno', vsPar: 0, holesCompleted: 0, totalHoles: 9 }])
    expect(shouldNotifySpectators(players, false)).toBe(false)
  })

  it('9 hoyos desde el 10: cuenta los hoyos 10..18 del equipo, no el 1..9', () => {
    const par18: Record<number, number> = { ...parMap }
    for (let h = 10; h <= 18; h++) par18[h] = parMap[h - 9]
    const players = buildSpectatorPlayers({
      formato: 'scramble', modo: 'gross', totalHoles: 9, hoyoInicio: 10,
      leaderboard: [],
      equipos: [eq('a', 'Los Tigres', { '10': 4, '11': 4, '1': 9 })],
      parMap: par18, siMap: {},
    })
    expect(players[0]).toMatchObject({ holesCompleted: 2, vsPar: 0 })
  })

  it('individual y best ball: una fila por jugador, desde el leaderboard', () => {
    const players = buildSpectatorPlayers({
      formato: 'best_ball', modo: 'gross', totalHoles: 18, hoyoInicio: 1,
      leaderboard: [{ nombre: 'Alberto Chadwick', vsPar: 2, holesPlayed: 4 }, { nombre: 'Papa', vsPar: 0, holesPlayed: 0 }],
      equipos: [eq('a', 'Equipo', {})],
      parMap, siMap,
    })
    expect(players).toEqual([
      { nombre: 'Alberto Chadwick', vsPar: 2, holesCompleted: 4, totalHoles: 18 },
      { nombre: 'Papa', vsPar: 0, holesCompleted: 0, totalHoles: 18 },
    ])
  })
})
