// src/lib/mi-golf/stats.ts
import type { HistoricalRound, StatsForma } from './types'
import { agregarRondas, bucketPrincipal, rondasQueCuentan, type RondaNormalizada } from '@/golf/stats/rondas-normalizadas'

/**
 * Mejor score: el de /perfil/stats (agregarRondas sobre rondas normalizadas, en el
 * bucket que más juega el jugador). Nunca un scramble ni un par inventado.
 */
function mejorScoreDe(normalizadas: RondaNormalizada[]): StatsForma['mejorScore'] {
  const bucket = bucketPrincipal(normalizadas)
  if (bucket == null) return null
  const agregados = agregarRondas(normalizadas)
  const mejor = bucket === 18 ? agregados.bestRound18 : agregados.bestRound9
  return mejor ? { gross: mejor.score, vsPar: mejor.vsPar, hoyos: bucket } : null
}

/**
 * Promedio de las últimas 5: mismas rondas que cuentan y mismo bucket que el mejor score
 * (antes usaba otra regla de bucket y metía scrambles y match play en el promedio).
 */
function promedioUltimas5De(normalizadas: RondaNormalizada[]): StatsForma['promedioUltimas5'] {
  const bucket = bucketPrincipal(normalizadas)
  if (bucket == null) return null
  // Más reciente primero; sort estable: con la misma fecha conserva el orden de la capa de datos.
  const ultimas = rondasQueCuentan(
    [...normalizadas].sort((a, b) => (a.played_at < b.played_at ? 1 : a.played_at > b.played_at ? -1 : 0)),
    bucket,
  ).slice(0, 5)
  if (ultimas.length === 0) return null
  const promedio = ultimas.reduce((s, r) => s + r.total_gross, 0) / ultimas.length
  return { promedio, hoyos: bucket, serie: ultimas.map(r => r.total_gross).reverse() }
}

export function calcularStatsForma(rondas: HistoricalRound[], normalizadas: RondaNormalizada[]): StatsForma {
  if (rondas.length === 0) {
    return {
      promedioUltimas5: promedioUltimas5De(normalizadas),
      mejorScore: mejorScoreDe(normalizadas),
      rondasJugadas: 0,
      canchaFavorita: null,
    }
  }

  const promedioUltimas5 = promedioUltimas5De(normalizadas)
  const mejorScore = mejorScoreDe(normalizadas)

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
