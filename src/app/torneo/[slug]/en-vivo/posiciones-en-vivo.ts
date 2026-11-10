// Posiciones con empates estilo golf ("T2") de las tablas del torneo en vivo.
//
// La posición es dentro de la competencia (todo el field, o la categoría elegida):
// un filtro de VISTA (grupo de salida, "Solo mi grupo") no cambia el lugar de nadie.
// Por eso se calcula sobre la lista sin esos filtros y se busca por id.

import type { LivePlayer, LiveTeam } from './types'
import { etiquetasConRespaldo } from '@/golf/core/posiciones'
import { hasPlayData } from '@/golf/leaderboard/board-rules'

export type PosicionesPorId = ReadonlyMap<string, string | null>

const noSalio = (f: { thru: number }) => !hasPlayData({ holesPlayed: f.thru })

/** Jugadores en el orden del motor. Respaldo sin clave: mismo vs par (o puntos en stableford). */
export function posicionesDeJugadores(players: readonly LivePlayer[], stableford: boolean): PosicionesPorId {
  const etiquetas = etiquetasConRespaldo(
    players,
    (p) => p.clave_empate,
    (a, b) => (stableford ? (a.points_total ?? 0) === (b.points_total ?? 0) : a.vs_par === b.vs_par),
    noSalio,
  )
  return new Map(players.map((p, i) => [p.id, etiquetas[i]]))
}

/** Equipos en el orden del motor (con countback). Respaldo sin clave: mismo vs par. */
export function posicionesDeEquipos(teams: readonly LiveTeam[]): PosicionesPorId {
  const etiquetas = etiquetasConRespaldo(teams, (t) => t.clave_empate, (a, b) => a.vs_par === b.vs_par, noSalio)
  return new Map(teams.map((t, i) => [t.id, etiquetas[i]]))
}
