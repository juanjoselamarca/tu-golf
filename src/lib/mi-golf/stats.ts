// src/lib/mi-golf/stats.ts
import type { HistoricalRound, StatsForma } from './types'
import { getVsPar } from './par'

export function calcularStatsForma(rondas: HistoricalRound[]): StatsForma {
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

  // Mejor score = el que tiene MENOR vsPar (mejor performance), no el menor gross.
  // Esto compara 9 hoyos con 18 hoyos correctamente.
  const conGross = rondas.filter((r) => r.total_gross != null)
  let mejorScore: StatsForma['mejorScore'] = null
  let mejorVsPar = Infinity
  for (const r of conGross) {
    const vsPar = getVsPar(r.total_gross, r.holes_played)
    if (vsPar != null && vsPar < mejorVsPar) {
      mejorVsPar = vsPar
      mejorScore = { gross: r.total_gross!, vsPar }
    }
  }

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
