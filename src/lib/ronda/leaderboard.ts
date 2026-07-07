// ─── Cálculo del leaderboard individual (puro, testeable) ───────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// Behavior-preserving: mismo cálculo y mismo orden que el bloque inline previo.

import { getVsPar, getVsParNeto, getHolesPlayed } from '@/lib/ronda/helpers'
import { puntosStablefordHoyo } from '@/golf/core/scoring'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import type { Jugador, ModoJuego, FormatoJuego } from '@/types/ronda'

/** Entrada del leaderboard: jugador + métricas derivadas. */
export type LeaderboardEntry = Jugador & {
  /** vsPar usado para ordenar/mostrar según modo (neto o gross). */
  vsPar: number
  vsParGross: number
  vsParNeto: number
  courseHcp: number
  holesPlayed: number
  stablefordPts: number
}

export interface BuildLeaderboardArgs {
  jugadores: Jugador[]
  holes: number
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
}

/**
 * Construye el leaderboard ordenado:
 * - jugadores sin hoyos jugados van al final;
 * - stableford ordena por puntos descendente;
 * - el resto ordena por vsPar ascendente (menos golpes = mejor).
 */
export function buildLeaderboard({
  jugadores,
  holes,
  parMap,
  siMap,
  courseHcpMap,
  modoJuego,
  formatoJuego,
}: BuildLeaderboardArgs): LeaderboardEntry[] {
  const isNetoMode = modoJuego === 'neto'
  const isStableford = formatoJuego === 'stableford'

  // Normaliza el stroke index a una permutación válida 1..holes. El catálogo de
  // muchas canchas chilenas tiene el SI con duplicados/huecos (47/69 al 24-jun-2026);
  // sin esto, la alocación de golpes (strokesRecibidosEnHoyo) cuenta mal los hoyos
  // con SI bajo y el net 18h sale +2/+3 de más (bug de campo "net +12 Don Jorge").
  const siMapNorm = normalizeStrokeIndexMap(siMap, holes)

  return [...jugadores]
    .map(j => {
      const vsParGross = getVsPar(j.scores, holes, parMap)
      const courseHcp = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)
      const vsParNeto = getVsParNeto(j.scores, holes, parMap, siMapNorm, courseHcp)
      const vsPar = isNetoMode ? vsParNeto : vsParGross
      const holesPlayed = getHolesPlayed(j.scores, holes)
      let stablefordPts = 0
      if (isStableford) {
        for (let h = 1; h <= holes; h++) {
          const s = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
          if (s != null) {
            const si = siMapNorm[h]
            const par = parMap[h] ?? 4
            stablefordPts += puntosStablefordHoyo(s, par, courseHcp, si, holes)
          }
        }
      }
      return { ...j, vsPar, vsParGross, vsParNeto, courseHcp, holesPlayed, stablefordPts }
    })
    .sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
      if (a.holesPlayed === 0) return 1
      if (b.holesPlayed === 0) return -1
      if (isStableford) return b.stablefordPts - a.stablefordPts
      return a.vsPar - b.vsPar
    })
}

/**
 * Fuente única de "¿hay puntajes para mostrar en esta ronda?".
 *
 * El puntaje puede vivir en DOS lugares según la modalidad:
 *  - individual / best_ball → en cada jugador (`holesPlayed > 0`)
 *  - scramble / foursome    → en el equipo (`equipos[].scores`), no en el jugador
 *
 * Reemplaza los 3 predicados inconsistentes que vivían inline en la pantalla
 * de resultados (uno miraba `leaderboard[0]`, otro `leaderboard.some(...)`).
 * NO depende del orden del leaderboard.
 */
export function hasPlayData(
  leaderboard: ReadonlyArray<{ holesPlayed: number }>,
  equipos: ReadonlyArray<{ scores: Record<string, number> }>,
): boolean {
  return (
    leaderboard.some(j => j.holesPlayed > 0) ||
    equipos.some(e => Object.keys(e.scores).length > 0)
  )
}
