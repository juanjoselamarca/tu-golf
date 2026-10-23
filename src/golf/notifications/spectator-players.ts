// src/golf/notifications/spectator-players.ts
//
// Jugadores del aviso del espectador en el CLIENTE (marcador abierto, botón
// "Seguir"), con la MISMA fuente que el servidor (loadRoundForPush):
//  - individual / best ball: una fila por jugador, desde el leaderboard.
//  - bola compartida (scramble / foursome): una fila por equipo, desde
//    ronda_equipos. En prod el puntaje de esas rondas vive SOLO ahí
//    (team-round-payload.ts, review #449 C1): leer ronda_libre_jugadores daba
//    holesCompleted = 0 toda la ronda → "Aún sin puntajes" en un scramble que
//    iba en el hoyo 7, y con la regla "primer aviso con el primer puntaje"
//    (shouldNotifySpectators) el seguidor no habría recibido nada (review PR
//    #634, I-1).
//
// Puro.

import type { Equipo } from '@/app/ronda-libre/[codigo]/types'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { hoyosDelMotor, isSharedBallFormat } from '@/golf/formats'
import { buildTeamRoundPlayers } from './team-round-payload'
import type { SpectatorPlayer } from './spectator'

/** Lo que el aviso necesita de una fila del leaderboard individual. */
export interface SpectatorLeaderboardRow {
  nombre: string
  vsPar: number
  holesPlayed: number
}

export interface SpectatorPlayersInput {
  formato: FormatoJuego
  modo: ModoJuego
  totalHoles: number
  hoyoInicio: number | null | undefined
  leaderboard: SpectatorLeaderboardRow[]
  equipos: Equipo[]
  parMap: Record<number, number>
  siMap: Record<number, number>
}

export function buildSpectatorPlayers(input: SpectatorPlayersInput): SpectatorPlayer[] {
  const { formato, modo, totalHoles, hoyoInicio, leaderboard, equipos, parMap, siMap } = input
  if (isSharedBallFormat(formato)) {
    // Mismos hoyos y mismo respaldo (par 4, SI = número) que rankTeams y que el servidor.
    const holes = hoyosDelMotor(hoyosDeLaRonda(hoyoInicio, totalHoles), h => parMap[h], h => siMap[h])
    return buildTeamRoundPlayers({ equipos, holes, formato, modo, totalHoles })
  }
  return leaderboard.map(j => ({ nombre: j.nombre, vsPar: j.vsPar, holesCompleted: j.holesPlayed, totalHoles }))
}
