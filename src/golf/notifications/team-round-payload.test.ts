import { describe, it, expect } from 'vitest'
import { buildTeamRoundPlayers, type TeamHole } from './team-round-payload'
import { buildSpectatorNotification, SPECTATOR_COPY } from './spectator'

const holes9: TeamHole[] = [4, 4, 3, 4, 5, 4, 3, 4, 5].map((par, i) => ({ numero: i + 1, par, stroke_index: i + 1 }))
const eq = (id: string, nombre: string, scores: Record<string, number>) =>
  ({ id, nombre, handicap_equipo: 10, jugadorIds: [], scores })

describe('buildTeamRoundPlayers — scramble/foursome leen de ronda_equipos (review C1)', () => {
  it('scramble con 3 hoyos → un "jugador" por equipo, Thru 3, vs-par bruto de lo jugado', () => {
    const players = buildTeamRoundPlayers({
      equipos: [eq('a', 'Los Tigres', { '1': 4, '2': 5, '3': 2 }), eq('b', 'Las Águilas', { '1': 5, '2': 5 })],
      holes: holes9, formato: 'scramble', modo: 'gross', totalHoles: 9,
    })
    expect(players.find(p => p.nombre === 'Los Tigres')).toEqual({ nombre: 'Los Tigres', vsPar: 0, holesCompleted: 3, totalHoles: 9 })
    expect(players.find(p => p.nombre === 'Las Águilas')).toEqual({ nombre: 'Las Águilas', vsPar: 2, holesCompleted: 2, totalHoles: 9 })
    const n = buildSpectatorNotification({ courseName: 'Los Leones', codigo: 'X', totalHoles: 9, players })
    expect(n.title).toBe('Los Leones · Thru 3')
    expect(n.body).toBe('Tigres E | Águilas +2')
  })

  it('foursome usa el motor de foursome y también da Thru/vs-par', () => {
    const players = buildTeamRoundPlayers({
      equipos: [eq('a', 'Dúo Uno', { '1': 3, '2': 4 })],
      holes: holes9, formato: 'foursome', modo: 'neto', totalHoles: 9,
    })
    expect(players[0]).toMatchObject({ nombre: 'Dúo Uno', vsPar: -1, holesCompleted: 2 })
  })

  it('sin scores en equipos → "Aún sin puntajes" (y NO "Resultado final · Aún sin puntajes" con scores reales)', () => {
    const vacio = buildTeamRoundPlayers({ equipos: [eq('a', 'Los Tigres', {})], holes: holes9, formato: 'scramble', modo: 'gross', totalHoles: 9 })
    expect(buildSpectatorNotification({ courseName: 'L', codigo: 'X', totalHoles: 9, players: vacio }).body).toBe(SPECTATOR_COPY.noScoresYet)

    const completa = buildTeamRoundPlayers({
      equipos: [eq('a', 'Los Tigres', Object.fromEntries(holes9.map(h => [String(h.numero), h.par])))],
      holes: holes9, formato: 'scramble', modo: 'gross', totalHoles: 9,
    })
    const n = buildSpectatorNotification({ courseName: 'L', codigo: 'X', totalHoles: 9, players: completa, finished: true })
    expect(n.title).toBe('Resultado final · L')
    expect(n.body).toBe('Tigres E')
  })
})
