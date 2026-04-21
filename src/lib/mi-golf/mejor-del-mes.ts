// src/lib/mi-golf/mejor-del-mes.ts
import type { HistoricalRound } from './types'
import { getVsPar } from './par'

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/**
 * Marca una ronda como "mejor del mes" comparando por vsPar (consciente de 9 vs 18 hoyos).
 * Empate: la más antigua (played_at menor) gana.
 */
export function esMejorDelMes(
  ronda: HistoricalRound,
  historico: HistoricalRound[],
  fechaHoy: string
): boolean {
  if (ronda.total_gross == null || !ronda.played_at) return false
  if (!sameMonth(ronda.played_at, fechaHoy)) return false

  const candidatas = historico.filter(
    (r) => r.total_gross != null && r.played_at && sameMonth(r.played_at, fechaHoy)
  )
  if (candidatas.length === 0) return false

  const candidatasConVsPar = candidatas
    .map((r) => ({ r, vsPar: getVsPar(r.total_gross, r.holes_played) }))
    .filter((x): x is { r: HistoricalRound; vsPar: number } => x.vsPar != null)

  if (candidatasConVsPar.length === 0) return false

  const mejorVsPar = Math.min(...candidatasConVsPar.map((x) => x.vsPar))
  const rondaVsPar = getVsPar(ronda.total_gross, ronda.holes_played)
  if (rondaVsPar !== mejorVsPar) return false

  const empatadas = candidatasConVsPar.filter((x) => x.vsPar === mejorVsPar).map((x) => x.r)
  const masAntigua = empatadas.reduce((a, b) =>
    (a.played_at ?? '') < (b.played_at ?? '') ? a : b
  )
  return masAntigua.id === ronda.id
}
