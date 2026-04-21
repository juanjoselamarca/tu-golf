import type { HistoricalRound } from './types'

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

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

  const mejorGross = Math.min(...candidatas.map((r) => r.total_gross!))
  if (ronda.total_gross !== mejorGross) return false

  const empatadas = candidatas.filter((r) => r.total_gross === mejorGross)
  const masAntigua = empatadas.reduce((a, b) =>
    (a.played_at ?? '') < (b.played_at ?? '') ? a : b
  )
  return masAntigua.id === ronda.id
}
