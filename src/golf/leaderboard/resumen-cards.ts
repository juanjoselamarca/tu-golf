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

/**
 * Un puntero "quién va mejor".
 *
 * `enCurso` distingue el CAMPEÓN del LÍDER PARCIAL, y no es cosmético: es la
 * diferencia entre un resultado y una foto a mitad de vuelta. Decisión de
 * producto (2-ago-2026): el organizador quiere ver la señal mientras se juega,
 * pero etiquetada — mostrar un parcial como si fuera definitivo es la misma
 * clase de número engañoso que este PR vino a matar.
 */
export interface ResumenLider {
  name: string
  /** Golpes ABSOLUTOS (gross o neto según la tarjeta). Nunca de `total_*`. */
  score: number
  /** Hoyos jugados. Con `enCurso` la UI debe mostrarlo: 68 golpes thru 12 no es
   *  comparable con 68 thru 18, y sin el thru el número miente. */
  thru: number
  /** `true` = todavía no terminó. La UI lo rotula "en curso". */
  enCurso: boolean
}

export interface ResumenCards {
  /** Total de inscritos que entran al board (mismo filtro que la vista pública). */
  totalJugadores: number
  /** Jugadores con al menos un score (`hasPlayData`). */
  conScore: number
  /** Tarjetas terminadas: cerradas Y completas (`isFinishedCard`). */
  completos: number
  /** Mejor gross: campeón del podio si hay tarjetas terminadas; si no, el líder
   *  parcial marcado `enCurso`. Null sólo si nadie scoreó todavía. */
  mejorGross: ResumenLider | null
  /** Ídem en neto — golpes netos derivados por el motor, nunca `total_net`. */
  mejorNeto: ResumenLider | null
}

const conDatos = (p: Player) => hasPlayData({ holesPlayed: p.holes })

/**
 * Líder parcial de un ranking ya ordenado por el motor.
 *
 * El orden lo decide `rankEntries` por vs par de los hoyos JUGADOS, que es la
 * comparación correcta a mitad de vuelta y la misma que muestra el board en
 * vivo. Acá sólo se toma el primero con datos — cero golf nuevo.
 */
function liderParcial(ranking: Player[], golpesDe: (p: Player) => number | undefined): ResumenLider | null {
  const p = ranking.find(conDatos)
  if (!p) return null
  return { name: p.name, score: golpesDe(p) ?? 0, thru: p.holes, enCurso: true }
}

export function computeResumenCards(
  players: Player[],
  playersByGross: Player[],
  playersByNeto: Player[],
  parTotal: number,
): ResumenCards {
  // El podio sólo existe cuando hay tarjetas terminadas; devuelve null si no.
  const resultados = computeTournamentResults(playersByGross, playersByNeto, parTotal, null)

  const campeon = (e: { name: string; score: number } | null | undefined, ranking: Player[]): ResumenLider | null => {
    if (!e) return null
    const p = ranking.find((x) => x.name === e.name)
    return { name: e.name, score: e.score, thru: p?.holes ?? 0, enCurso: false }
  }

  return {
    totalJugadores: players.length,
    conScore: players.filter(conDatos).length,
    completos: players.filter(isFinishedCard).length,
    mejorGross: campeon(resultados?.grossWinner, playersByGross)
      ?? liderParcial(playersByGross, (p) => p.grossTotal),
    mejorNeto: campeon(resultados?.netoWinner, playersByNeto)
      ?? liderParcial(playersByNeto, (p) => p.netTotal),
  }
}
