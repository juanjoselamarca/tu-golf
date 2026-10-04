// ─── Helper de match play para la vista live ────────────────────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// El cálculo del MatchResult se repetía inline 4 veces (cuadro ganador, card en
// vivo, share x2, timeline). Centralizado acá, behavior-preserving.

import type { MatchResult } from '@/golf/formats/match-play'
import { matchDeLaRonda } from '@/golf/ronda-libre/match-de-la-ronda'
import type { RondaLibre } from '@/types/ronda'

/** Array de hoyos {numero, par, stroke_index} a partir de los mapas de cancha. */
export function buildHolesArr(
  parMap: Record<number, number>,
  siMap: Record<number, number>,
): Array<{ numero: number; par: number; stroke_index: number }> {
  return Object.entries(parMap).map(([num, par]) => ({
    numero: Number(num),
    par,
    stroke_index: siMap[Number(num)] ?? Number(num),
  }))
}

/**
 * Resultado de match play de los 2 jugadores de la ronda (fuente única
 * `matchDeLaRonda`: la misma del scorer y del historial, con los hoyos
 * concedidos). `null` si no aplica (no es match play, <2 jugadores, sin hoyos).
 */
export function buildMatchResult(
  ronda: RondaLibre,
  parMap: Record<number, number>,
  siMap: Record<number, number>,
  courseHcpMap: Record<string, number>,
): MatchResult | null {
  return matchDeLaRonda({
    ronda,
    scoresPorJugador: Object.fromEntries(ronda.ronda_libre_jugadores.map(j => [j.id, j.scores])),
    hoyos: buildHolesArr(parMap, siMap),
    courseHcpPorJugador: courseHcpMap,
  })
}
