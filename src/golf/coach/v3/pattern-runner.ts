import type { ComputedMetric, RoundData } from '@/golf/coach/metrics'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeScores } from '@/lib/data/focus'
import {
  computePostBogeyAvg,
  computeBack9MinusFront9,
  computeFirstHole,
  computePar3VsPar,
  computeLast4MinusRest,
  computeShortGameGap,
  computeThreePuttRate,
} from '@/golf/coach/metrics'

/**
 * Runner de observaciones de patrones (Cerebro V3, Ola 3 chunk 2).
 *
 * Por cada ronda del historial computa el valor per-ronda de cada patrón
 * observable (reusando `src/golf/coach/metrics/`) y produce filas para
 * `pattern_observations` — la serie cruda sobre la que corre el validador.
 *
 * Las funciones de cómputo son PURAS y nunca lanzan. El orquestador
 * `backfillPatternObservations` (idempotente, espeja `backfillRoundMetrics`)
 * vive aparte y hace el I/O con Supabase.
 *
 * Seam de chunk 3: hoy el observador se resuelve solo por `OBSERVE_BY_KEY`;
 * chunk 3 agregará `?? interpretObserver(formula_payload)` para patrones
 * declarativos nuevos sin código.
 */

/** Invierte el signo del value preservando reason/metadata (orientación del catálogo). */
function negate(fn: (round: RoundData) => ComputedMetric): (round: RoundData) => ComputedMetric {
  return (round) => {
    const m = fn(round)
    return m.value === null ? m : { ...m, value: -m.value }
  }
}

/**
 * Math per-ronda de cada patrón gen-0 observable, ligada por `pattern_key`.
 * Invariante: todo value cumple "más alto = peor" (de ahí el negate en
 * front_nine_struggles, que comparte métrica con back_nine_collapse con signo
 * opuesto). `driving_inconsistency` NO está: es `cross_round` (el CV es propiedad
 * de la serie, no de una ronda) — su anti-fantasía sigue siendo el detect.
 */
export const OBSERVE_BY_KEY: Record<string, (round: RoundData) => ComputedMetric> = {
  post_bogey_spiral: computePostBogeyAvg,
  back_nine_collapse: computeBack9MinusFront9,
  front_nine_struggles: negate(computeBack9MinusFront9),
  first_hole_anxiety: computeFirstHole,
  par_3_weakness: computePar3VsPar,
  pressure_deterioration: computeLast4MinusRest,
  short_game_weakness: computeShortGameGap,
  three_putt_frequency: computeThreePuttRate,
}

/** Lo mínimo que el runner necesita de pattern_definitions. */
export interface RunnablePatternDef {
  id: string
  pattern_key: string
  version: number
  formula_kind: string
  status: 'active' | 'validating' | 'archived'
}

export interface PatternObservationInsert {
  pattern_id: string
  pattern_key: string
  pattern_version: number
  round_id: string
  user_id: string
  value: number
  metadata: Record<string, unknown> | null
}

/**
 * PURA: observaciones de UNA ronda contra los patrones corribles. Salta sin
 * error los patrones sin observador (cross_round / sin binding) y las métricas
 * que devuelven `value: null`. Nunca lanza.
 */
export function computeObservationsForRound(
  round: RoundData,
  userId: string,
  defs: RunnablePatternDef[],
): PatternObservationInsert[] {
  const out: PatternObservationInsert[] = []
  for (const def of defs) {
    const observe = OBSERVE_BY_KEY[def.pattern_key]
    if (!observe) continue
    let metric: ComputedMetric
    try {
      metric = observe(round)
    } catch {
      continue // CERO FALLOS: una métrica que tire no rompe el resto de la ronda.
    }
    if (metric.value === null || !Number.isFinite(metric.value)) continue
    out.push({
      pattern_id: def.id,
      pattern_key: def.pattern_key,
      pattern_version: def.version,
      round_id: round.id,
      user_id: userId,
      value: metric.value,
      metadata: metric.metadata ?? null,
    })
  }
  return out
}

/** Forma mínima de una fila de historical_rounds que el runner lee. */
interface RawHistoricalRow {
  id: string
  scores: unknown
  total_gross: number | null
  par_per_hole: unknown
  played_at: string
  metadata: Record<string, unknown> | null
}

/**
 * Orquestador idempotente (espeja backfillRoundMetrics): computa y persiste las
 * observaciones FALTANTES de un usuario. Incluye defs `validating` (un patrón
 * nuevo acumula evidencia ANTES de activarse). Service_role (la RLS solo deja
 * escribir a service_role). Re-correr no duplica: salta lo ya observado en
 * memoria + UNIQUE(pattern_id,round_id) con ignoreDuplicates de cinturón.
 */
export async function backfillPatternObservations(
  admin: SupabaseClient,
  userId: string,
): Promise<{ inserted: number; roundsScanned: number; patternsRun: number }> {
  const { data: defsRaw, error: defsErr } = await admin
    .from('pattern_definitions')
    .select('id, pattern_key, version, formula_kind, status')
    .in('status', ['active', 'validating'])
  if (defsErr) throw defsErr
  const defs = (defsRaw ?? []) as RunnablePatternDef[]

  const { data: roundsRaw, error: rErr } = await admin
    .from('historical_rounds')
    .select('id, scores, total_gross, par_per_hole, played_at, metadata')
    .eq('user_id', userId)
  if (rErr) throw rErr
  const rounds = (roundsRaw ?? []) as RawHistoricalRow[]

  const { data: existingRaw, error: eErr } = await admin
    .from('pattern_observations')
    .select('pattern_id, round_id')
    .eq('user_id', userId)
  if (eErr) throw eErr
  const seen = new Set(
    ((existingRaw ?? []) as { pattern_id: string; round_id: string }[]).map((e) => `${e.pattern_id}|${e.round_id}`),
  )

  const inserts: PatternObservationInsert[] = []
  for (const r of rounds) {
    const round: RoundData = {
      id: r.id,
      scores: normalizeScores(r.scores),
      total_gross: r.total_gross,
      par_per_hole: r.par_per_hole as RoundData["par_per_hole"],
      played_at: r.played_at,
      metadata: r.metadata,
    }
    for (const o of computeObservationsForRound(round, userId, defs)) {
      if (!seen.has(`${o.pattern_id}|${o.round_id}`)) inserts.push(o)
    }
  }

  if (inserts.length > 0) {
    const { error: upErr } = await admin
      .from('pattern_observations')
      .upsert(inserts, { onConflict: 'pattern_id,round_id', ignoreDuplicates: true })
    if (upErr) throw upErr
  }
  return { inserted: inserts.length, roundsScanned: rounds.length, patternsRun: defs.length }
}
