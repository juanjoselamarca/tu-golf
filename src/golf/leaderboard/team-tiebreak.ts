// src/golf/leaderboard/team-tiebreak.ts
//
// Desempate de equipos por countback USGA. Fuente ÚNICA del concepto
// "cómo se rompe un empate en un board" (regla "un concepto, una fuente"):
// reutiliza el mismo motor `resolveLeaderboardTies` que el path individual
// (`rank-entries.ts`), en vez de un desempate paralelo. `ordenarEquipos*`
// (scramble/foursome/best_ball) llaman acá.

import { resolveLeaderboardTies, type CountbackMode } from '@/golf/core/countback'

export interface TeamCountbackAccessors<T> {
  /** Score primario que define el empate. Menor gana con 'lower_wins', mayor con 'higher_wins'. */
  primaryScore: (t: T) => number
  /** Score por hoyo del equipo para el card-off (índice 0 = hoyo 1). Huecos → 0. */
  holeScores: (t: T) => number[]
  /** Dirección del desempate: 'lower_wins' (gross/neto) o 'higher_wins' (stableford). */
  mode: CountbackMode
}

/**
 * Ordena equipos por su score primario y rompe empates con countback USGA
 * (hole-count-aware: 18h usa back-9/6/3/1, 9h usa back-6/3/1). Genérico sobre
 * el tipo de resultado de equipo — cada formato provee los accessors.
 */
export function rankTeamsWithCountback<T>(
  teams: T[],
  acc: TeamCountbackAccessors<T>,
): T[] {
  if (teams.length <= 1) return [...teams]

  // 1) Orden primario (asc con lower_wins, desc con higher_wins). Deja los
  //    empatados en posiciones consecutivas para que resolveLeaderboardTies
  //    los agrupe.
  const sign = acc.mode === 'higher_wins' ? -1 : 1
  const ordered = [...teams].sort((a, b) => (acc.primaryScore(a) - acc.primaryScore(b)) * sign)

  // 2) Countback dentro de cada grupo de empatados. holeCount = nº de hoyos del
  //    card (9 o 18) → los segmentos de back-count se calculan solos.
  const holeCount = ordered.reduce((mx, t) => Math.max(mx, acc.holeScores(t).length), 0)
  const cbPlayers = ordered.map((t, i) => ({
    id: String(i),
    name: String(i),
    scores: acc.holeScores(t),
    primaryScore: acc.primaryScore(t),
  }))
  const resolved = resolveLeaderboardTies(cbPlayers, acc.mode, holeCount)

  return resolved.map((r) => ordered[parseInt(r.id, 10)])
}
