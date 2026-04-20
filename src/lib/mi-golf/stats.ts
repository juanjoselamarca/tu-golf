// src/lib/mi-golf/stats.ts
import type { HistoricalRound, StatsForma } from './types'

const PAR_DEFAULT = 72

export function calcularStatsForma(
  rondas: HistoricalRound[],
  parReferencia: number = PAR_DEFAULT
): StatsForma {
  if (rondas.length === 0) {
    return {
      promedioUltimas5: null,
      mejorScore: null,
      rondasJugadas: 0,
      canchaFavorita: null,
    }
  }

  const ordenadas = [...rondas].sort((a, b) => {
    const ta = a.played_at ? new Date(a.played_at).getTime() : 0
    const tb = b.played_at ? new Date(b.played_at).getTime() : 0
    return tb - ta
  })

  const ultimas5 = ordenadas.slice(0, 5).filter((r) => r.total_gross != null)
  const promedioUltimas5 =
    ultimas5.length > 0
      ? ultimas5.reduce((s, r) => s + (r.total_gross ?? 0), 0) / ultimas5.length
      : null

  const conGross = rondas.filter((r) => r.total_gross != null)
  const mejorGross = conGross.length > 0 ? Math.min(...conGross.map((r) => r.total_gross!)) : null
  const mejorScore =
    mejorGross != null ? { gross: mejorGross, vsPar: mejorGross - parReferencia } : null

  const contador = new Map<string, number>()
  for (const r of rondas) {
    if (!r.course_name) continue
    contador.set(r.course_name, (contador.get(r.course_name) ?? 0) + 1)
  }
  let canchaFavorita: StatsForma['canchaFavorita'] = null
  let max = 0
  contador.forEach((count, nombre) => {
    if (count > max) {
      max = count
      canchaFavorita = { nombre, vecesJugada: count }
    }
  })

  return {
    promedioUltimas5,
    mejorScore,
    rondasJugadas: rondas.length,
    canchaFavorita,
  }
}
