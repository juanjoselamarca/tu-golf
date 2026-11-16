'use client'

import { useMemo } from 'react'
import {
  agregarRondas,
  bucketPrincipal,
  contarHoyoAHoyo,
  mejorRonda,
  promedioVsPar,
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
 * src/golf/stats/rondas-normalizadas — las dos pantallas dicen los mismos números.
 *
 * UN bucket de hoyos para toda la pantalla (bucketPrincipal sobre TODAS las rondas):
 * cifra héroe, birdies/eagles, distribución, gráfico, mejores rondas y tendencia hablan
 * de las MISMAS rondas. El rango ("Últimas 5") se aplica DESPUÉS del bucket: son las
 * últimas 5 rondas que cuentan, no las últimas 5 registradas (que podían ser de equipo
 * o del otro bucket y dejar la pantalla en "—").
 */
export function useStatsDerived(allRondas: RondaNormalizada[], range: RangeKey) {
  const ordenadas = useMemo(() => [...allRondas].sort(porFechaDesc), [allRondas])
  const bucket = useMemo(() => bucketPrincipal(ordenadas), [ordenadas])
  const tope = range === 'all' ? Infinity : parseInt(range, 10)

  // Se expone para el test de coherencia historial = stats (mismo set con range 'all').
  const rondas = useMemo(() => ordenadas.slice(0, tope), [ordenadas, tope])
  const agregados: AgregadosDeRondas = useMemo(() => agregarRondas(rondas), [rondas])
  const hasRounds = ordenadas.length > 0

  /** Rondas registradas que no entran a promedios (equipo, match play, incompletas, error de carga). */
  const fueraDePromedios = useMemo(() => allRondas.filter(r => r.fueraDePromedios != null).length, [allRondas])

  /** Rondas que cuentan pero son del OTRO bucket: no se mezclan, se dice cuántas son. */
  const delOtroBucket = useMemo(() => {
    if (bucket == null) return null
    const otro: 18 | 9 = bucket === 18 ? 9 : 18
    const n = rondasQueCuentan(ordenadas, otro).length
    return n > 0 ? { bucket: otro, n } : null
  }, [ordenadas, bucket])

  // Más reciente primero, ya recortado al rango.
  const delBucket = useMemo(
    () => (bucket == null ? [] : rondasQueCuentan(ordenadas, bucket).slice(0, tope)),
    [ordenadas, bucket, tope],
  )

  const cifras: CifrasStats | null = useMemo(() => {
    if (bucket == null) return null
    return {
      bucket,
      rondasEnPromedio: delBucket.length,
      promedioVsPar: promedioVsPar(delBucket),
      mejorRonda: mejorRonda(delBucket),
    }
  }, [bucket, delBucket])

  // Birdies/eagles y distribución sobre las MISMAS rondas que la cifra héroe.
  const scoringCounts = useMemo(() => contarHoyoAHoyo(delBucket), [delBucket])
  const scoringTotal = scoringCounts.eagles + scoringCounts.birdies
    + scoringCounts.pars + scoringCounts.bogeys + scoringCounts.doubles

  // MISMO orden cronológico que la tendencia (reverse de `ordenadas`): con dos rondas el
  // mismo día, el sort estable de serieScoreVsPar conserva el orden recibido, y si
  // gráfico y tendencia ordenan los empates distinto el veredicto puede cambiar de signo.
  const serie = useMemo(
    () => (bucket == null ? [] : serieScoreVsPar([...delBucket].reverse(), bucket)),
    [delBucket, bucket],
  )

  // Ida/vuelta: solo si la pantalla habla de 18 hoyos, con tarjeta de 18 exactos
  // (una de 27 no tiene un "back 9" único).
  const nineHoleData = useMemo(
    () => (bucket === 18 ? frontBackNine(delBucket.filter(r => r.tarjeta.length === 18 && r.scores.length === 18)) : null),
    [delBucket, bucket],
  )

  const topRounds = useMemo(() => [...delBucket].sort((a, b) => a.vsPar - b.vsPar).slice(0, 5), [delBucket])

  // Tendencia sobre TODAS las rondas del bucket (no el rango): compara las últimas 5
  // con las anteriores. scoringTrendLast5 espera orden cronológico.
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
    delOtroBucket,
    scoringCounts,
    scoringTotal,
    serie,
    nineHoleData,
    topRounds,
    trendData,
  }
}
