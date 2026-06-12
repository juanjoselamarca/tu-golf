/**
 * Capa de datos de las observaciones de patrones (Cerebro V3, Ola 3 chunk 2).
 * Sólo trae filas y las normaliza a la serie `ObservationPair[]` por patrón que
 * consume el validador. Sin matemática (esa vive en `pattern-validator.ts`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ObservationPair } from '@/golf/coach/v3/pattern-validator'
import { MIN_18H_COURSE_RATING } from '@/golf/coach/v3/progress/round-metrics'

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

interface ObsRow { pattern_key: string; value: number | string | null; round_id: string }
interface RoundRow {
  id: string
  diferencial: number | string | null
  course_rating: number | string | null
  excluded_from_handicap: boolean | null
}

/**
 * Series por patrón del usuario, joinneadas en memoria con el diferencial WHS
 * ELEGIBLE de cada ronda. Elegibilidad = misma que `computeRoundMetric`
 * (round-metrics.ts): no excluida de handicap, diferencial presente, y CR ≥ 55
 * (descarta 9h legacy con CR de 9 hoyos, cuyo diferencial es raw no comparable).
 * Cliente autenticado del request (RLS owner-read). Lanza si la query falla.
 */
export async function loadObservationPairs(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, ObservationPair[]>> {
  const [{ data: obs, error: oErr }, { data: rounds, error: rErr }] = await Promise.all([
    supabase.from('pattern_observations').select('pattern_key, value, round_id').eq('user_id', userId),
    supabase
      .from('historical_rounds')
      .select('id, diferencial, course_rating, excluded_from_handicap')
      .eq('user_id', userId),
  ])
  if (oErr) throw oErr
  if (rErr) throw rErr

  // Diferencial elegible por ronda.
  const diffByRound = new Map<string, number>()
  for (const r of (rounds ?? []) as RoundRow[]) {
    if (r.excluded_from_handicap) continue
    const dif = toNum(r.diferencial)
    if (dif == null) continue
    const cr = toNum(r.course_rating)
    if (cr == null || cr < MIN_18H_COURSE_RATING) continue
    diffByRound.set(r.id, dif)
  }

  const out: Record<string, ObservationPair[]> = {}
  for (const o of (obs ?? []) as ObsRow[]) {
    const y = diffByRound.get(o.round_id)
    if (y == null) continue
    const x = toNum(o.value)
    if (x == null) continue
    ;(out[o.pattern_key] ??= []).push({ x, y })
  }
  return out
}
