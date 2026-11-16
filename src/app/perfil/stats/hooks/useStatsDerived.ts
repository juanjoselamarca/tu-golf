'use client'

import { useMemo } from 'react'
import {
  agregarRondas,
  contarHoyoAHoyo,
  mejorRonda,
  rondasQueCuentan,
  serieScoreVsPar,
  type AgregadosDeRondas,
  type BestRound,
  type RondaNormalizada,
} from '@/golf/stats/rondas-normalizadas'
import { scoringTrendLast5, frontBackNine } from '@/golf/stats/personal'

export type RangeKey = '5' | '10' | '20' | 'all'

/** Las cifras principales, de UN solo bucket de hoyos (18 si hay; si el jugador solo juega 9, de 9). */
export interface CifrasStats {
  bucket: 18 | 9
  promedioVsPar: number | null
  mejorRonda: BestRound | null
  peorRonda: BestRound | null
}

const porFechaDesc = (a: RondaNormalizada, b: RondaNormalizada) =>
  a.played_at < b.played_at ? 1 : a.played_at > b.played_at ? -1 : 0

/** Más alto vsPar; en empate gana la primera en el orden recibido. */
function peorRonda(rondas: RondaNormalizada[]): BestRound | null {
  let peor: RondaNormalizada | null = null
  for (const r of rondas) {
    if (r.vsPar != null && (!peor || r.vsPar > (peor.vsPar as number))) peor = r
  }
  return peor
    ? { score: peor.total_gross, course: peor.course_name, date: peor.played_at, vsPar: peor.vsPar as number, roundId: peor.id }
    : null
}

/** Shape que esperan scoringTrendLast5 / frontBackNine, con el bucket ya resuelto (no holes_played crudo). */
const paraTendencia = (r: RondaNormalizada) => ({
  total_gross: r.total_gross,
  vsPar: r.vsPar,
  holes_played: r.bucket,
  scores: r.scores,
})

/**
 * Derivadas de /perfil/stats. Las rondas llegan normalizadas (la MISMA fuente
 * que /perfil/historial: fetchRondasNormalizadas) y los agregados salen de
 * agregarRondas — por construcción, las dos pantallas dicen los mismos números.
 *
 * El rango toma las N rondas más recientes (orden explícito más reciente primero).
 */
export function useStatsDerived(allRondas: RondaNormalizada[], range: RangeKey) {
  const ordenadas = useMemo(() => [...allRondas].sort(porFechaDesc), [allRondas])

  const rondas = useMemo(
    () => (range === 'all' ? ordenadas : ordenadas.slice(0, parseInt(range, 10))),
    [ordenadas, range],
  )

  const agregados: AgregadosDeRondas = useMemo(() => agregarRondas(rondas), [rondas])
  const hasRounds = rondas.length > 0

  const cifras: CifrasStats | null = useMemo(() => {
    const bucket: 18 | 9 | null = agregados.totalRounds18 > 0 ? 18 : agregados.totalRounds9 > 0 ? 9 : null
    if (bucket == null) return null
    const delBucket = rondasQueCuentan(rondas, bucket)
    return {
      bucket,
      promedioVsPar: bucket === 18 ? agregados.avgOverPar18 : agregados.avgOverPar9,
      mejorRonda: mejorRonda(delBucket),
      peorRonda: peorRonda(delBucket),
    }
  }, [agregados, rondas])

  const scoringCounts = useMemo(() => contarHoyoAHoyo(rondas), [rondas])
  const scoringTotal = scoringCounts.eagles + scoringCounts.birdies
    + scoringCounts.pars + scoringCounts.bogeys + scoringCounts.doubles

  const serie = useMemo(() => serieScoreVsPar(rondas), [rondas])
  const promedioSerie = serie.length > 0
    ? Math.round((serie.reduce((s, p) => s + p.vsPar18, 0) / serie.length) * 10) / 10
    : null

  // Front/Back: solo 18 hoyos exactos que cuentan (una de 27 no tiene un "back 9" único).
  const nineHoleData = useMemo(
    () => frontBackNine(rondasQueCuentan(rondas, 18).filter(r => r.tarjeta.length === 18 && r.scores.length === 18)),
    [rondas],
  )

  const topRounds = useMemo(() => {
    if (!cifras) return []
    return rondasQueCuentan(rondas, cifras.bucket)
      .filter(r => r.vsPar != null)
      .sort((a, b) => (a.vsPar as number) - (b.vsPar as number))
      .slice(0, 5)
  }, [rondas, cifras])

  // Tendencia sobre TODAS las rondas (no el rango filtrado): el rango afecta
  // gráfico y cifras, no la tendencia. scoringTrendLast5 espera orden cronológico.
  const trendData = useMemo(
    () => scoringTrendLast5(ordenadas.filter(r => r.fueraDePromedios == null).reverse().map(paraTendencia)),
    [ordenadas],
  )

  return {
    rondas,
    hasRounds,
    agregados,
    cifras,
    scoringCounts,
    scoringTotal,
    serie,
    promedioSerie,
    nineHoleData,
    topRounds,
    trendData,
  }
}
