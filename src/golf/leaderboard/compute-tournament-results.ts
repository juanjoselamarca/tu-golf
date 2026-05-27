// src/golf/leaderboard/compute-tournament-results.ts
//
// Resultados oficiales de un torneo cerrado (1° y 2° gross/neto, promedio
// de campo, eagles, birdies). Solo se invoca cuando status === 'closed'
// o 'published' y hay al menos 1 jugador con ronda terminada.

import type { Player } from '@/lib/golf-data'
import type { TournamentResultados } from '@/app/torneo/[slug]/types'
import type { TourneyStats } from './types'

export function computeTournamentResults(
  players: Player[],
  parTotal: number,
  stats: TourneyStats | null,
): TournamentResultados | null {
  const finishedPlayers = players.filter((p) => p.status === 'F' && p.holes > 0)
  if (finishedPlayers.length === 0) return null

  const grossOf = (p: Player) =>
    (p.scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0)

  const byGross = [...finishedPlayers].sort((a, b) => grossOf(a) - grossOf(b))
  const byNeto  = [...finishedPlayers].sort((a, b) => a.total - b.total)

  const grossScore1 = byGross[0] ? grossOf(byGross[0]) : 0
  const grossScore2 = byGross[1] ? grossOf(byGross[1]) : 0
  const netoScore1  = byNeto[0]  ? byNeto[0].total + parTotal : 0
  const netoScore2  = byNeto[1]  ? byNeto[1].total + parTotal : 0

  const avgGross = finishedPlayers.reduce((sum, p) => sum + grossOf(p), 0) / finishedPlayers.length

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
