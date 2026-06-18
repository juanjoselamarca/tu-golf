// ─── Helper de match play para la vista live ────────────────────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// El cálculo del MatchResult se repetía inline 4 veces (cuadro ganador, card en
// vivo, share x2, timeline). Centralizado acá, behavior-preserving.

import { calcularMatchPlay, type MatchResult } from '@/golf/formats/match-play'
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
 * Calcula el resultado de match play de los 2 primeros jugadores de la ronda.
 * Devuelve null si no aplica (no es match play, <2 jugadores, o sin hoyos de cancha).
 */
export function buildMatchResult(
  ronda: RondaLibre,
  parMap: Record<number, number>,
  siMap: Record<number, number>,
  courseHcpMap: Record<string, number>,
): MatchResult | null {
  if (ronda.formato_juego !== 'match_play') return null
  const jug = ronda.ronda_libre_jugadores
  if (jug.length < 2) return null
  const holesArr = buildHolesArr(parMap, siMap)
  if (holesArr.length === 0) return null

  const scA: Record<string, number> = {}
  const scB: Record<string, number> = {}
  for (const [k, v] of Object.entries(jug[0].scores)) { if (v > 0) scA[k] = v }
  for (const [k, v] of Object.entries(jug[1].scores)) { if (v > 0) scB[k] = v }

  return calcularMatchPlay(scA, scB, holesArr, {
    courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
    courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
    totalHoles: ronda.holes,
    modo: ronda.modo_juego,
  }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
}
