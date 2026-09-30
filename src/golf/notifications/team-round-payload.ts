// src/golf/notifications/team-round-payload.ts
//
// "Jugadores" para el push de una ronda de bola compartida (scramble /
// foursome): cada equipo es una fila. En prod el score de esas rondas vive
// SOLO en ronda_equipos — leer ronda_libre_jugadores da "Aún sin puntajes"
// (review PR #449, C1).
//
// Motor: los standings canónicos de equipos (src/golf/leaderboard/team-standings,
// los mismos del marcador de torneos). Sin tercera copia del cálculo. Puro.

import type { Equipo } from '@/app/ronda-libre/[codigo]/types'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import type { ScrambleTeam, ScrambleTeamResult, FoursomeTeamResult } from '@/golf/formats'
import { computeScrambleStandings, computeFoursomeStandings } from '@/golf/leaderboard/team-standings'
import type { SpectatorPlayer } from './spectator'

export type TeamHole = { numero: number; par: number; stroke_index: number }

export interface TeamRoundPayloadInput {
  equipos: Equipo[]
  holes: TeamHole[]
  formato: FormatoJuego
  modo: ModoJuego
  totalHoles: number
}

/** vs-par bruto de los hoyos jugados, derivado del detalle del motor. */
function grossVsPar(result: ScrambleTeamResult | FoursomeTeamResult): number {
  return result.holes.reduce((acc, h) => acc + (h.overUnderGross ?? 0), 0)
}

export function buildTeamRoundPlayers(input: TeamRoundPayloadInput): SpectatorPlayer[] {
  const { equipos, holes, formato, modo, totalHoles } = input
  const parTotal = holes.reduce((a, h) => a + h.par, 0)
  const teams: ScrambleTeam[] = equipos.map(e => ({
    id: e.id,
    nombre: e.nombre,
    handicaps: [],
    scores: e.scores,
    teamHandicap: e.handicap_equipo ?? 0,
  }))
  const results = formato === 'foursome'
    ? computeFoursomeStandings(teams, {}, holes, parTotal, formato, modo, totalHoles)
    : computeScrambleStandings(teams, holes, parTotal, formato, modo, totalHoles)
  return results.map(r => ({
    nombre: r.teamNombre,
    vsPar: grossVsPar(r),
    holesCompleted: r.holesPlayed,
    totalHoles,
  }))
}
