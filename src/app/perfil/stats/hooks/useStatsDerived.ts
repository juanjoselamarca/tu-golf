'use client'

import { useMemo } from 'react'
import type { StatsRound } from '@/lib/data/stats'
import { vsPar, bestRoundByVsPar, worstRoundByVsPar, topRoundsByPerformance, parPerHoleArray } from '@/golf/core/compare'
import {
  aggregateScoringCounts,
  avgScoreBucket,
  scoringTrendLast5,
  frontBackNine,
  golfWellnessIndex,
  type RoundWithMeta,
} from '@/golf/stats/personal'

export type RangeKey = '5' | '10' | '20' | 'all'

/** StatsRound → shape que consume aggregateScoringCounts (par real por hoyo). */
function toAggregateRound(r: StatsRound): RoundWithMeta {
  return {
    ...r,
    hole_pars: parPerHoleArray(r.par_per_hole, r.scores?.length ?? 0) ?? null,
  }
}

/**
 * Derivadas de la pantalla de estadísticas a partir de las rondas (que ya
 * llegan fetcheadas por el Server Component) + el rango elegido por el user.
 * Toda la matemática de golf vive en src/golf (compare.ts / stats/personal.ts);
 * acá solo se compone y memoiza.
 */
export function useStatsDerived(allRounds: StatsRound[], range: RangeKey) {
  const rounds = useMemo(() => {
    if (range === 'all') return allRounds
    const n = parseInt(range)
    return allRounds.slice(-n)
  }, [allRounds, range])

  // Promedio filtrado a un solo bucket de hoyos (9 o 18) — nunca mezclar.
  const bucket = useMemo(() => avgScoreBucket(rounds), [rounds])
  const hasRounds = bucket != null
  const avgScore = bucket?.avg ?? 0
  const avgBucketHoles = bucket?.holes ?? null

  const bestRoundData = useMemo(
    () => (hasRounds ? bestRoundByVsPar(rounds) : null),
    [hasRounds, rounds],
  )
  const bestRound = bestRoundData ? bestRoundData.total_gross : 0
  const bestRoundVsPar = bestRoundData ? vsPar(bestRoundData) : 0

  const worstRoundData = useMemo(
    () => worstRoundByVsPar(rounds),
    [rounds],
  )

  const scoringCounts = useMemo(
    () => aggregateScoringCounts(rounds.map(toAggregateRound)),
    [rounds],
  )
  const scoringTotal = scoringCounts.eagles + scoringCounts.birdies
    + scoringCounts.pars + scoringCounts.bogeys + scoringCounts.doubles

  const gwiValue = hasRounds ? golfWellnessIndex(avgScore) : 0

  const nineHoleData = useMemo(() => frontBackNine(rounds), [rounds])

  const topRounds = useMemo(() => topRoundsByPerformance(rounds, 5), [rounds])

  // Tendencia sobre TODAS las rondas (no el rango filtrado) — comportamiento
  // original de la pantalla: el rango afecta charts/promedios, no la tendencia.
  const trendData = useMemo(() => scoringTrendLast5(allRounds), [allRounds])

  return {
    rounds,
    hasRounds,
    avgScore,
    avgBucketHoles,
    bestRoundData,
    bestRound,
    bestRoundVsPar,
    worstRoundData,
    scoringCounts,
    scoringTotal,
    gwiValue,
    nineHoleData,
    topRounds,
    trendData,
  }
}
