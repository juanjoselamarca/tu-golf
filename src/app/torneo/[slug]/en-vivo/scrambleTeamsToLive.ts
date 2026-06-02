import type { ScrambleTeamResult } from '@/golf/formats'
import type { LiveTeam, LivePlayer } from './types'

/** Nombres de jugadores por teamId (para la columna "Jugadores"). */
export type TeamMemberNames = Record<string, string[]>

function nameToLivePlayer(name: string, i: number): LivePlayer {
  return {
    id: `member-${i}`,
    name,
    handicap_index: 0,
    scores_per_hole: [],
    gross_total: 0,
    vs_par: 0,
    thru: 0,
  }
}

/**
 * Mapea los resultados del motor scramble a `LiveTeam` para `TeamLeaderboard`.
 * `team_total` y `vs_par` se eligen por modo (neto/gross).
 */
export function scrambleResultsToLiveTeams(
  results: ScrambleTeamResult[],
  memberNames: TeamMemberNames,
  modo: 'gross' | 'neto',
): LiveTeam[] {
  return results.map((r) => ({
    id: r.teamId,
    name: r.teamNombre,
    players: (memberNames[r.teamId] ?? []).map(nameToLivePlayer),
    team_scores_per_hole: r.holes.map((h) => h.gross ?? 0),
    team_total: modo === 'neto' ? r.totalNeto : r.totalGross,
    vs_par: modo === 'neto' ? r.overUnderNeto : r.overUnderGross,
    thru: r.holesPlayed,
  }))
}
