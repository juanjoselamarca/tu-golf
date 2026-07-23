import type { SupabaseClient } from '@supabase/supabase-js'
import { OR_EXCLUDE_FEDEGOLF } from '@/lib/data/historical-rounds-filters'
import { inferHoles } from '@/golf/core/holes'
import type { ComputedMetric, RoundData } from './types'

/**
 * Cálculo puro del coefficient of variation a partir de una lista de scores.
 * Separado del query de DB para que sea snapshotable en regression tests.
 */
export function computeCV(grosses: number[]): ComputedMetric {
  if (grosses.length < 5) return { value: null, reason: 'insufficient_rounds_for_cv' }
  const mean = grosses.reduce((a, b) => a + b, 0) / grosses.length
  const variance = grosses.reduce((a, b) => a + (b - mean) ** 2, 0) / grosses.length
  const std = Math.sqrt(variance)
  const cv = mean > 0 ? std / mean : 0
  return { value: cv, reason: 'computed', metadata: { mean, std, sample_size: grosses.length } }
}

/**
 * Wrapper async: trae las últimas 10 rondas 18h del usuario y aplica computeCV.
 *
 * historical_rounds y rondas_libres son fuentes distintas — usamos
 * historical_rounds. CV/variance sólo es comparable entre rondas del mismo
 * hole count — mezclar 9h con 18h infla cv artificialmente.
 */
export async function computeTotalGrossCV(
  supabase: SupabaseClient,
  userId: string,
  _round: RoundData,
): Promise<ComputedMetric> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('total_gross, played_at, holes_played, scores')
    .eq('user_id', userId)
    .or(OR_EXCLUDE_FEDEGOLF) // CV de gross sin las tarjetas FedeGolf (espejo score-only)
    .order('played_at', { ascending: false })
    .limit(20)

  if (error) return { value: null, reason: error.message }
  const only18h = (data ?? [])
    .filter(r => inferHoles(r as { holes_played?: number | null; scores?: number[] | null }) === 18)
    .slice(0, 10)
  const grosses = only18h
    .map(r => (typeof r.total_gross === 'number' ? r.total_gross : null))
    .filter((x): x is number => x !== null)

  return computeCV(grosses)
}
