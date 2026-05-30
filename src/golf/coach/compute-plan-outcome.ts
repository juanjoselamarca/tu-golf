/**
 * Compute Plan Outcome — para cada ronda nueva, mide la métrica del plan
 * activo del jugador y persiste el resultado en plan_outcomes.
 *
 * Llamado por:
 *  (a) trigger SQL en historical_rounds AFTER INSERT (FASE 1A.5.5 inline)
 *  (b) trigger en rondas_libres AFTER UPDATE WHEN estado='finalizada'
 *  (c) cola async si load test p95 ≥ 100ms (D7)
 *
 * Lifecycle:
 *  - Si no hay plan activo → no-op.
 *  - 3 outcomes consecutivos con target_reached=true → plan resolved.
 *  - Métricas que requieren breakdown que no tenemos (three_putts,
 *    short_game) → compliance='unknown', metric_value=null en metadata,
 *    delta_vs_baseline=null.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.5 + §5.7
 * Schema: supabase/migrations/034_cerebro_foundation.sql
 *
 * Ola 0 Task 12: las 7 funciones de cómputo de métricas vivían acá; ahora
 * cada una vive en `src/golf/coach/metrics/<name>.ts` con sus tests de
 * regresión. Este archivo orquesta plan activo + ronda + dispatch +
 * persistencia, nada de matemática de hoyos.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import type { PlanMetric, TargetOp } from './plan-engine'
import {
  computeBack9MinusFront9,
  computeFirstHole,
  computePar3VsPar,
  computePostBogeyAvg,
  computeDoubleOrWorsePct,
  computeLast4MinusRest,
  computeTotalGrossCV,
  type ComputedMetric,
  type RoundData,
} from './metrics'

const CONSECUTIVE_HITS_TO_RESOLVE = 3

export type RoundSource =
  | { historical_round_id: string }
  | { ronda_libre_id: string }

export interface ComputeOutcomeOptions {
  supabase: SupabaseClient // RLS-bound user client (lectura de coach_plans + ronda)
  userId: string
  roundSource: RoundSource
}

export interface ComputeOutcomeResult {
  ok: boolean
  outcome_id?: string
  plan_resolved?: boolean
  reason?: string // 'no_active_plan' | 'round_not_found' | 'metric_unknown' | 'computed'
}

interface PlanRow {
  id: string
  pattern_id: string
  metric: PlanMetric
  target_value: number
  target_op: TargetOp
  baseline_value: number | null
  duration_days: number
  created_at: string
}

export async function computePlanOutcomeForRound(
  opts: ComputeOutcomeOptions,
): Promise<ComputeOutcomeResult> {
  const { supabase, userId, roundSource } = opts

  // 1) Plan activo
  const { data: plan, error: planErr } = await supabase
    .from('coach_plans')
    .select('id, pattern_id, metric, target_value, target_op, baseline_value, duration_days, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle<PlanRow>()

  if (planErr) return { ok: false, reason: planErr.message }
  if (!plan) return { ok: true, reason: 'no_active_plan' }

  // 2) Ronda
  const round = await loadRound(supabase, userId, roundSource)
  if (!round) return { ok: true, reason: 'round_not_found' }

  // 3) Computar métrica del plan sobre la ronda (algunas requieren historial)
  const computed = await computeMetric(supabase, userId, plan.metric, round)

  // 4) Insertar plan_outcome (via service_role: no hay policy de INSERT para usuarios)
  const admin = createAdminClient()
  const targetReached = computed.value === null
    ? false
    : evalTarget(computed.value, plan.target_value, plan.target_op)

  const compliance: 'full' | 'partial' | 'none' | 'unknown' = computed.value === null
    ? 'unknown'
    : targetReached
      ? 'full'
      : isPartial(computed.value, plan.baseline_value, plan.target_value, plan.target_op)
        ? 'partial'
        : 'none'

  const delta = computed.value !== null && plan.baseline_value !== null
    ? computed.value - plan.baseline_value
    : null

  const insertRow: Record<string, unknown> = {
    plan_id: plan.id,
    user_id: userId,
    played_at: round.played_at,
    metric_value: computed.value ?? 0, // NUMERIC NOT NULL en schema; 0 cuando unknown, compliance='unknown' lo señaliza
    delta_vs_baseline: delta,
    target_reached: targetReached,
    compliance,
    metadata: {
      metric: plan.metric,
      computed_value_raw: computed.value,
      reason: computed.reason,
      ...(computed.metadata ?? {}),
    },
  }
  if ('historical_round_id' in roundSource) insertRow.historical_round_id = roundSource.historical_round_id
  if ('ronda_libre_id' in roundSource) insertRow.ronda_libre_id = roundSource.ronda_libre_id

  const { data: outcome, error: outErr } = await admin
    .from('plan_outcomes')
    .insert(insertRow)
    .select('id')
    .single()

  if (outErr || !outcome) return { ok: false, reason: outErr?.message ?? 'no insert' }

  // 5) Si target_reached por 3 outcomes consecutivos → plan resolved
  let planResolved = false
  if (targetReached) {
    const { data: recent } = await admin
      .from('plan_outcomes')
      .select('target_reached')
      .eq('plan_id', plan.id)
      .order('played_at', { ascending: false })
      .limit(CONSECUTIVE_HITS_TO_RESOLVE)

    const last3 = (recent ?? []) as Array<{ target_reached: boolean }>
    if (last3.length >= CONSECUTIVE_HITS_TO_RESOLVE && last3.every(r => r.target_reached)) {
      await admin
        .from('coach_plans')
        .update({
          status: 'resolved',
          resolution_reason: 'target_reached_3_consecutive',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', plan.id)
        .eq('status', 'active')
      planResolved = true

      await admin
        .from('coach_events')
        .insert({
          user_id: userId,
          type: 'plan_resolved',
          payload: { plan_id: plan.id, reason: 'target_reached_3_consecutive' },
          related_plan_id: plan.id,
        })
    }
  }

  // 6) Event sourcing (no fatal si falla)
  await admin
    .from('coach_events')
    .insert({
      user_id: userId,
      type: 'plan_outcome',
      payload: {
        plan_id: plan.id,
        outcome_id: outcome.id,
        metric: plan.metric,
        metric_value: computed.value,
        target_reached: targetReached,
        compliance,
        delta,
      },
      related_plan_id: plan.id,
    })

  return {
    ok: true,
    outcome_id: outcome.id,
    plan_resolved: planResolved,
    reason: 'computed',
  }
}

// ---------- Dispatch de métricas (las implementaciones viven en `./metrics/`) ----------

async function computeMetric(
  supabase: SupabaseClient,
  userId: string,
  metric: PlanMetric,
  round: RoundData,
): Promise<ComputedMetric> {
  switch (metric) {
    case 'back9_minus_front9_strokes':
      return computeBack9MinusFront9(round)
    case 'avg_first_hole_score':
      return computeFirstHole(round)
    case 'par3_avg_vs_par':
      return computePar3VsPar(round)
    case 'post_bogey_score_avg':
      return computePostBogeyAvg(round)
    case 'double_or_worse_pct':
      return computeDoubleOrWorsePct(round)
    case 'last4holes_minus_rest_strokes':
      return computeLast4MinusRest(round)
    case 'total_gross_cv':
      return computeTotalGrossCV(supabase, userId, round)
    case 'three_putts_per_round':
      return { value: null, reason: 'metric_requires_putt_breakdown_not_tracked' }
    case 'short_game_strokes_per_round':
      return { value: null, reason: 'metric_requires_shot_breakdown_not_tracked' }
    default:
      return { value: null, reason: 'unknown_metric' }
  }
}

// ---------- Helpers de evaluación de target ----------

function evalTarget(value: number, target: number, op: TargetOp): boolean {
  if (op === 'lte') return value <= target
  if (op === 'gte') return value >= target
  return Math.abs(value - target) < 1e-9
}

/**
 * Si el plan no se cumplió pero la métrica está en mejor dirección que el
 * baseline (acercándose al target), se considera 'partial'. Si no, 'none'.
 */
function isPartial(value: number, baseline: number | null, target: number, op: TargetOp): boolean {
  if (baseline === null) return false
  if (op === 'lte') return value < baseline && value > target // bajó pero no llegó
  if (op === 'gte') return value > baseline && value < target // subió pero no llegó
  return Math.abs(value - target) < Math.abs(baseline - target)
}

async function loadRound(
  supabase: SupabaseClient,
  userId: string,
  source: RoundSource,
): Promise<RoundData | null> {
  if ('historical_round_id' in source) {
    const { data } = await supabase
      .from('historical_rounds')
      .select('id, scores, total_gross, par_per_hole, played_at, metadata')
      .eq('id', source.historical_round_id)
      .eq('user_id', userId)
      .maybeSingle()
    return (data ?? null) as RoundData | null
  }

  // ronda_libre: fetch desde rondas_libres + ronda_libre_jugadores para scores del usuario
  const { data: rl } = await supabase
    .from('rondas_libres')
    .select('id, course_id, fecha, course_name')
    .eq('id', source.ronda_libre_id)
    .maybeSingle()
  if (!rl) return null

  const { data: jug } = await supabase
    .from('ronda_libre_jugadores')
    .select('scores')
    .eq('ronda_id', source.ronda_libre_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!jug) return null

  const scores = (jug.scores as (number | null)[] | null) ?? null
  const total = scores?.reduce((a: number, b) => a + (b ?? 0), 0) ?? null

  return {
    id: rl.id,
    scores,
    total_gross: total,
    par_per_hole: null,
    played_at: rl.fecha as string,
    metadata: null,
  }
}
