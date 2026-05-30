// src/golf/leaderboard/compute-tournament-results.ts
//
// Resultados oficiales de un torneo cerrado (1° y 2° gross/neto, promedio
// de campo, eagles, birdies). Solo se invoca cuando status === 'closed'
// o 'published' y hay al menos 1 jugador con ronda terminada.

import type { Player } from '@/lib/golf-data'
import type { TournamentResultados } from '@/app/torneo/[slug]/types'
import type { TourneyStats } from './types'

export function computeTournamentResults(
  playersByGross: Player[],
  playersByNeto: Player[],
  parTotal: number,
  stats: TourneyStats | null,
): TournamentResultados | null {
  const grossOf = (p: Player) =>
    (p.scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0)

  // Ambos rankings llegan YA ordenados con countback por modo desde
  // `rankEntries` (gross asc por strokes, neto asc por net-vs-par). NO se
  // re-ordena: re-inferir el neto desde el ranking primario rompía el podio
  // en torneos gross-mode (el primario trae vsPar del modo, no net). Solo
  // filtramos finished preservando el orden.
  const byGross = playersByGross.filter((p) => p.status === 'F' && p.holes > 0)
  const byNeto  = playersByNeto.filter((p) => p.status === 'F' && p.holes > 0)
  if (byGross.length === 0) return null

  const grossScore1 = byGross[0] ? grossOf(byGross[0]) : 0
  const grossScore2 = byGross[1] ? grossOf(byGross[1]) : 0
  // Player.total del ranking neto = net vs-par; el score neto en strokes es
  // net-vs-par + parTotal (misma fórmula que el código legacy).
  const netoScore1  = byNeto[0]  ? byNeto[0].total + parTotal : 0
  const netoScore2  = byNeto[1]  ? byNeto[1].total + parTotal : 0

  const avgGross = byGross.reduce((sum, p) => sum + grossOf(p), 0) / byGross.length

  return {
    grossWinner: byGross[0] ? { name: byGross[0].name, score: grossScore1 } : null,
    netoWinner:  byNeto[0]  ? { name: byNeto[0].name,  score: netoScore1 }  : null,
    grossSecond: byGross[1] ? { name: byGross[1].name, score: grossScore2 } : null,
    netoSecond:  byNeto[1]  ? { name: byNeto[1].name,  score: netoScore2 }  : null,
    avgField: avgGross,
    totalEagles:  stats?.eagles  ?? 0,
    totalBirdies: stats?.birdies ?? 0,
  }
}
