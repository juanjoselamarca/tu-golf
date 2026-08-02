// src/golf/leaderboard/resumen-cards.ts
//
// Tarjetas del tab "Resumen" del scorer del organizador. Proyección PURA de la
// salida del motor (`buildLeaderboardFromLegacy`) — acá no se calcula golf.
//
// Historia: era la CUARTA copia del concepto "quién va mejor en este torneo",
// con una TERCERA definición de "terminado". Las dos mentían en prod:
//  - "N completos" filtraba `rounds.status === 'completed'`, un valor que la
//    columna NUNCA toma (prod: in_progress/closed) → contador clavado en 0.
//  - "Mejor Neto" leía `rounds[0].total_net` con guard `n !== 0`; `total_net`
//    es denormalizada y sólo la escribe /api/game (19 de 77 rondas de prod en
//    0) → la tarjeta rendía "--" con el torneo jugado.
//
// Un concepto, una fuente:
//  - "terminado"        → `isFinishedCard` (el MISMO portero del podio/stats).
//  - "¿tiene datos?"    → `hasPlayData`.
//  - "mejor gross/neto" → `computeTournamentResults` (el PODIO del torneo
//    cerrado). El Resumen muestra literalmente los números del podio: mismo
//    torneo, mismos números en el scorer y en la vista pública.

import { isFinishedCard, hasPlayData } from './board-rules'
import { computeTournamentResults } from './compute-tournament-results'
import type { Player } from '@/lib/golf-data'

export interface ResumenCards {
  /** Total de inscritos que entran al board (mismo filtro que la vista pública). */
  totalJugadores: number
  /** Jugadores con al menos un score (`hasPlayData`). */
  conScore: number
  /** Tarjetas terminadas: cerradas Y completas (`isFinishedCard`). */
  completos: number
  /** Campeón gross del podio (sólo tarjetas terminadas), o null si nadie terminó. */
  mejorGross: { name: string; score: number } | null
  /** Campeón neto del podio — golpes netos ABSOLUTOS derivados por el motor,
   *  nunca la columna `total_net`. */
  mejorNeto: { name: string; score: number } | null
}

export function computeResumenCards(
  players: Player[],
  playersByGross: Player[],
  playersByNeto: Player[],
  parTotal: number,
): ResumenCards {
  const resultados = computeTournamentResults(playersByGross, playersByNeto, parTotal, null)
  return {
    totalJugadores: players.length,
    conScore: players.filter((p) => hasPlayData({ holesPlayed: p.holes })).length,
    completos: players.filter(isFinishedCard).length,
    mejorGross: resultados?.grossWinner ?? null,
    mejorNeto: resultados?.netoWinner ?? null,
  }
}
