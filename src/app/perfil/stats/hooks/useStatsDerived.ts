'use client'

import { useMemo } from 'react'
import {
  agregarRondas,
  bucketPrincipal,
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

/** Las cifras principales, todas del MISMO bucket de hoyos (bucketPrincipal). */
export interface CifrasStats {
  bucket: 18 | 9
  /** Rondas del rango que entran al promedio (el n que se muestra junto al rótulo). */
  rondasEnPromedio: number
  promedioVsPar: number | null
  mejorRonda: BestRound | null
}

const porFechaDesc = (a: RondaNormalizada, b: RondaNormalizada) =>
  a.played_at < b.played_at ? 1 : a.played_at > b.played_at ? -1 : 0

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
 * UN bucket de hoyos para toda la pantalla (bucketPrincipal sobre TODAS las rondas,
 * no sobre el rango): cifra héroe, gráfico, mejores rondas y tendencia hablan de lo
 * mismo. El rango toma las N rondas más recientes.
 */
export function useStatsDerived(allRondas: RondaNormalizada[], range: RangeKey) {
  const ordenadas = useMemo(() => [...allRondas].sort(porFechaDesc), [allRondas])
  const bucket = useMemo(() => bucketPrincipal(ordenadas), [ordenadas])

  const rondas = useMemo(
    () => (range === 'all' ? ordenadas : ordenadas.slice(0, parseInt(range, 10))),
    [ordenadas, range],
  )

  // Se expone para el test de coherencia historial = stats.
  const agregados: AgregadosDeRondas = useMemo(() => agregarRondas(rondas), [rondas])
  const hasRounds = rondas.length > 0

  /** Rondas registradas que no entran a promedios (equipo, match play, incompletas, error de carga). */
  const fueraDePromedios = useMemo(() => allRondas.filter(r => r.fueraDePromedios != null).length, [allRondas])

  const delBucket = useMemo(
    () => (bucket == null ? [] : rondasQueCuentan(rondas, bucket).filter(r => r.vsPar != null)),
    [rondas, bucket],
  )

  const cifras: CifrasStats | null = useMemo(() => {
    if (bucket == null) return null
    return {
      bucket,
      rondasEnPromedio: delBucket.length,
      promedioVsPar: bucket === 18 ? agregados.avgOverPar18 : agregados.avgOverPar9,
      mejorRonda: mejorRonda(delBucket),
    }
  }, [bucket, delBucket, agregados])

  const scoringCounts = useMemo(() => contarHoyoAHoyo(rondas), [rondas])
  const scoringTotal = scoringCounts.eagles + scoringCounts.birdies
    + scoringCounts.pars + scoringCounts.bogeys + scoringCounts.doubles

  const serie = useMemo(() => (bucket == null ? [] : serieScoreVsPar(rondas, bucket)), [rondas, bucket])

  // Front/Back: solo 18 hoyos exactos que cuentan (una de 27 no tiene un "back 9" único).
  const nineHoleData = useMemo(
    () => frontBackNine(rondasQueCuentan(rondas, 18).filter(r => r.tarjeta.length === 18 && r.scores.length === 18)),
    [rondas],
  )

  const topRounds = useMemo(
    () => [...delBucket].sort((a, b) => (a.vsPar as number) - (b.vsPar as number)).slice(0, 5),
    [delBucket],
  )

  // Tendencia sobre TODAS las rondas del bucket (no el rango): el rango afecta
  // gráfico y cifras, no la tendencia. scoringTrendLast5 espera orden cronológico.
  const trendData = useMemo(
    () => (bucket == null ? null : scoringTrendLast5(rondasQueCuentan(ordenadas, bucket).reverse().map(paraTendencia))),
    [ordenadas, bucket],
  )

  return {
    rondas,
    hasRounds,
    agregados,
    cifras,
    fueraDePromedios,
    scoringCounts,
    scoringTotal,
    serie,
    nineHoleData,
    topRounds,
    trendData,
  }
}
