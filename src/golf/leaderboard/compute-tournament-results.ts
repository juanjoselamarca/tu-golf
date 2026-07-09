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
 * Podio de parejas para torneos por equipos. Toma los standings YA ordenados y
 * con desempate aplicado (el mismo `ordered` del board, vía `computeScrambleStandings`
 * etc.) y arma el top-3 en el modo/formato del torneo. Fuente única del "quién ganó"
 * de equipos — evita el podio individual que mostraba `computeTournamentResults`.
 *
 * @returns TournamentResultados con `teamPodium` seteado y el podio individual en
 *          null, o `null` si ningún equipo jugó.
 */
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
