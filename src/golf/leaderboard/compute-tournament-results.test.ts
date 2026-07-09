// Tests del podio oficial de torneo cerrado (1°/2° gross y neto).
//
// Canario del bug detectado en review de PR #64: en torneos gross-mode,
// el podio Neto debe salir del ranking NETO (net-vs-par), no inferirse del
// ranking primario (que trae vs-par del modo de vista = gross).

import { describe, it, expect } from 'vitest'
import type { Player } from '@/lib/golf-data'
import { computeTournamentResults, computeTeamTournamentResults, type TeamStandingForPodium } from './compute-tournament-results'

// Player mínimo para el podio. `scores` es un array cuyo SUM = strokes gross
// (computeTournamentResults usa grossOf = suma de scores). `total` = vs-par
// del ranking en el que vive el player (gross o neto).
function mk(name: string, total: number, grossStrokes: number, over: Partial<Player> = {}): Player {
  return {
    pos: 0,
    name,
    country: 'CL',
    cat: 'General',
    hcp: 0,
    today: total,
    total,
    holes: 18,
    status: 'F',
    scores: [grossStrokes],
    ...over,
  }
}

describe('computeTournamentResults — podio gross/neto independiente', () => {
  it('en torneo gross-mode, el ganador Neto sale del ranking NETO (no del gross)', () => {
    // A: mejor gross (-2, 70 strokes) pero hcp bajo → neto -1.
    // B: peor gross (+3, 75 strokes) pero hcp alto → neto -5 (gana en neto).
    // Los rankings llegan YA ordenados (cada uno por su modo).
    const playersByGross: Player[] = [mk('A', -2, 70), mk('B', 3, 75)]
    const playersByNeto: Player[] = [mk('B', -5, 75), mk('A', -1, 70)]

    const r = computeTournamentResults(playersByGross, playersByNeto, 72, null)

    expect(r).not.toBeNull()
    // Gross: A gana con 70 strokes; B segundo con 75.
    expect(r!.grossWinner).toEqual({ name: 'A', score: 70 })
    expect(r!.grossSecond).toEqual({ name: 'B', score: 75 })
    // Neto: B gana (NO A — ese era el bug). score = net-vs-par(-5) + par(72) = 67.
    expect(r!.netoWinner).toEqual({ name: 'B', score: 67 })
    expect(r!.netoSecond).toEqual({ name: 'A', score: 71 })
  })

  it('devuelve null si ningún jugador terminó', () => {
    const live: Player[] = [mk('X', -1, 71, { status: 'live' })]
    expect(computeTournamentResults(live, live, 72, null)).toBeNull()
  })

  it('promedio de campo usa los strokes gross de los finished', () => {
    const g: Player[] = [mk('A', -2, 70), mk('B', 2, 74)]
    const n: Player[] = [mk('A', -2, 70), mk('B', 2, 74)]
    const r = computeTournamentResults(g, n, 72, null)
    expect(r!.avgField).toBe(72) // (70 + 74) / 2
  })
})

describe('computeTeamTournamentResults — podio de parejas', () => {
  const mkTeam = (
    teamId: string, teamNombre: string, overUnderNeto: number,
    over: Partial<TeamStandingForPodium> = {},
  ): TeamStandingForPodium => ({
    teamId, teamNombre, overUnderNeto, overUnderGross: 0, totalStableford: 0, holesPlayed: 9, ...over,
  })

  it('arma el podio top-3 en modo neto con integrantes y score vs-par', () => {
    const ordered = [
      mkTeam('a', 'Águilas', -3),
      mkTeam('b', 'Cóndores', -1),
      mkTeam('c', 'Halcones', 0),
      mkTeam('d', 'Tordos', 2),
    ]
    const members = { a: ['Juan', 'Pedro'], b: ['Ana', 'Luis'], c: ['Nico', 'Tomás'], d: ['Pin', 'Pon'] }
    const r = computeTeamTournamentResults(ordered, members, 'neto', 'scramble')
    expect(r).not.toBeNull()
    expect(r!.teamPodium).toHaveLength(3)
    expect(r!.teamPodium![0]).toEqual({ pos: 1, name: 'Águilas', members: 'Juan / Pedro', score: '-3' })
    expect(r!.teamPodium![1]).toEqual({ pos: 2, name: 'Cóndores', members: 'Ana / Luis', score: '-1' })
    expect(r!.teamPodium![2]).toEqual({ pos: 3, name: 'Halcones', members: 'Nico / Tomás', score: 'E' })
    // En torneo por equipos el podio individual va nulo.
    expect(r!.grossWinner).toBeNull()
    expect(r!.netoWinner).toBeNull()
  })

  it('modo gross usa el vs-par gross', () => {
    const ordered = [mkTeam('a', 'A', -5, { overUnderGross: 3 })]
    const r = computeTeamTournamentResults(ordered, { a: [] }, 'gross', 'scramble')
    expect(r!.teamPodium![0].score).toBe('+3')
  })

  it('formato stableford: score en puntos', () => {
    const ordered = [mkTeam('a', 'A', 0, { totalStableford: 40 }), mkTeam('b', 'B', 0, { totalStableford: 38 })]
    const r = computeTeamTournamentResults(ordered, { a: [], b: [] }, 'neto', 'stableford')
    expect(r!.teamPodium![0].score).toBe('40 pts')
  })

  it('devuelve null si ningún equipo jugó', () => {
    const ordered = [mkTeam('a', 'A', -2, { holesPlayed: 0 })]
    expect(computeTeamTournamentResults(ordered, { a: [] }, 'neto', 'scramble')).toBeNull()
  })
})
