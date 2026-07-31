// src/golf/leaderboard/compute-tournament-results.ts
//
// Resultados oficiales de un torneo cerrado (1° y 2° gross/neto, promedio
// de campo, eagles, birdies). Solo se invoca cuando status === 'closed'
// o 'published' y hay al menos 1 jugador con ronda terminada.

import type { Player } from '@/lib/golf-data'
import type { TournamentResultados, TeamPodiumEntry } from '@/app/torneo/[slug]/types'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import type { TourneyStats } from './types'

export function computeTournamentResults(
  playersByGross: Player[],
  playersByNeto: Player[],
  parTotal: number,
  stats: TourneyStats | null,
): TournamentResultados | null {
  // Golpes brutos ACUMULADOS. `p.scores` es la tarjeta de la última ronda, así
  // que re-sumarla en un torneo multi-ronda devuelve sólo la vuelta final. El
  // motor ya emite el acumulado en `grossTotal`; la suma queda de respaldo para
  // los datos mock, que no lo traen.
  const grossOf = (p: Player) =>
    p.grossTotal ?? (p.scores || []).reduce((sum: number, s: number | null) => sum + (s ?? 0), 0)

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
  // Golpes netos ABSOLUTOS, leídos del motor. NO se reconstruyen como
  // `total + parTotal`: desde que `total` es vs par de los hoyos JUGADOS, esa
  // suma sólo acierta cuando el jugador completó la vuelta entera de una cancha
  // cuyo par coincide con `parTotal`. En un torneo de 9 hoyos sobre una cancha
  // de par 72 (COPA LB PADRE E HIJO 2026) inflaba el podio en 36 golpes, y en
  // multi-ronda sumaba un solo par por varias vueltas. La fórmula vieja queda
  // de respaldo para rankings sin `netTotal` (datos mock).
  const netoStrokesOf = (p: Player) => p.netTotal ?? p.total + parTotal
  const netoScore1  = byNeto[0]  ? netoStrokesOf(byNeto[0]) : 0
  const netoScore2  = byNeto[1]  ? netoStrokesOf(byNeto[1]) : 0

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

/** Forma mínima de un standing de equipo para el podio. La cumplen
 *  ScrambleTeamResult / FoursomeTeamResult / BestBallTeamResult. */
export interface TeamStandingForPodium {
  teamId: string
  teamNombre: string
  overUnderGross: number
  overUnderNeto: number
  totalStableford: number
  holesPlayed: number
}

/** vs-par formateado a la convención de golf: E / +n / -n. */
function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E'
  return vsPar > 0 ? `+${vsPar}` : `${vsPar}`
}

/**
 * Convierte standings de equipo YA ordenados (con desempate) en entradas de
 * podio, en el modo/formato del torneo. Fuente única del "quién ganó" de equipos:
 * la usan el podio de resultados (limit 3) y la tarjeta de compartir (limit 5).
 */
export function buildTeamPodium(
  orderedTeams: TeamStandingForPodium[],
  memberNames: Record<string, string[]>,
  modo: ModoJuego,
  formato: FormatoJuego,
  limit: number = 3,
): TeamPodiumEntry[] {
  const isStableford = formato === 'stableford'
  return orderedTeams
    .filter((t) => t.holesPlayed > 0)
    .slice(0, limit)
    .map((t, i) => ({
      pos: i + 1,
      name: t.teamNombre,
      members: (memberNames[t.teamId] ?? []).join(' / '),
      score: isStableford
        ? `${t.totalStableford} pts`
        : formatVsPar(modo === 'neto' ? t.overUnderNeto : t.overUnderGross),
    }))
}

/**
 * Resultados de un torneo por equipos: arma el podio de parejas (top-3) desde
 * los standings YA ordenados con desempate. Devuelve un TournamentResultados con
 * `teamPodium` seteado y el podio individual en null, o `null` si ningún equipo
 * jugó. Reemplaza al podio individual que mostraba `computeTournamentResults`.
 */
export function computeTeamTournamentResults(
  orderedTeams: TeamStandingForPodium[],
  memberNames: Record<string, string[]>,
  modo: ModoJuego,
  formato: FormatoJuego,
): TournamentResultados | null {
  const teamPodium = buildTeamPodium(orderedTeams, memberNames, modo, formato, 3)
  if (teamPodium.length === 0) return null

  return {
    grossWinner: null,
    netoWinner: null,
    grossSecond: null,
    netoSecond: null,
    avgField: 0,
    totalEagles: 0,
    totalBirdies: 0,
    teamPodium,
  }
}
