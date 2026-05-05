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
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'
import type { PlanMetric, TargetOp } from './plan-engine'

const STANDARD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
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

interface RoundData {
  id: string
  scores: (number | null)[] | null
  total_gross: number | null
  par_total: number | null
  hole_pars: number[] | null
  played_at: string
  metadata: Record<string, unknown> | null
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

// ---------- Métricas ----------

interface ComputedMetric {
  value: number | null
  reason: string
  metadata?: Record<string, unknown>
}

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

function pars(round: RoundData): number[] {
  return round.hole_pars && round.hole_pars.length === 18 ? round.hole_pars : STANDARD_PARS
}

function validScores(round: RoundData): { scores: number[]; pars: number[] } | null {
  if (!Array.isArray(round.scores)) return null
  const sc: number[] = []
  const pa = pars(round)
  for (let i = 0; i < 18; i++) {
    const s = round.scores[i]
    if (typeof s !== 'number') return null
    sc.push(s)
  }
  return { scores: sc, pars: pa }
}

function computeBack9MinusFront9(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  const front = sum(v.scores.slice(0, 9))
  const back = sum(v.scores.slice(9, 18))
  return { value: back - front, reason: 'computed', metadata: { front, back } }
}

function computeFirstHole(round: RoundData): ComputedMetric {
  const s = round.scores?.[0]
  if (typeof s !== 'number') return { value: null, reason: 'no_first_hole_score' }
  return { value: s, reason: 'computed' }
}

function computePar3VsPar(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let total = 0
  let count = 0
  for (let i = 0; i < 18; i++) {
    if (v.pars[i] === 3) {
      total += v.scores[i] - 3
      count++
    }
  }
  if (count === 0) return { value: null, reason: 'no_par3_holes' }
  return { value: total / count, reason: 'computed', metadata: { par3_count: count } }
}

function computePostBogeyAvg(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let total = 0
  let count = 0
  for (let i = 0; i < 17; i++) {
    const overPar = v.scores[i] - v.pars[i]
    if (overPar >= 1) {
      total += v.scores[i + 1]
      count++
    }
  }
  if (count === 0) return { value: null, reason: 'no_bogey_or_worse' }
  return { value: total / count, reason: 'computed', metadata: { post_bogey_count: count } }
}

function computeDoubleOrWorsePct(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  let dbl = 0
  for (let i = 0; i < 18; i++) {
    if (v.scores[i] - v.pars[i] >= 2) dbl++
  }
  return { value: dbl / 18, reason: 'computed', metadata: { double_or_worse: dbl } }
}

function computeLast4MinusRest(round: RoundData): ComputedMetric {
  const v = validScores(round)
  if (!v) return { value: null, reason: 'incomplete_18_holes' }
  const last4Avg = sum(v.scores.slice(14, 18)) / 4
  const restAvg = sum(v.scores.slice(0, 14)) / 14
  return { value: last4Avg - restAvg, reason: 'computed' }
}

async function computeTotalGrossCV(
  supabase: SupabaseClient,
  userId: string,
  round: RoundData,
): Promise<ComputedMetric> {
  // Necesita las ultimas 10 rondas (incluyendo la actual). Como historical_rounds
  // y rondas_libres son fuentes distintas, usamos historical_rounds (mas estable
  // para el coach). Si el jugador tiene <5 rondas con total_gross numerico,
  // metric=null.
  const { data, error } = await supabase
    .from('historical_rounds')
    .select('total_gross, played_at')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(10)

  if (error) return { value: null, reason: error.message }
  const grosses = (data ?? [])
    .map(r => (typeof r.total_gross === 'number' ? r.total_gross : null))
    .filter((x): x is number => x !== null)

  if (grosses.length < 5) return { value: null, reason: 'insufficient_rounds_for_cv' }

  const mean = grosses.reduce((a, b) => a + b, 0) / grosses.length
  const variance = grosses.reduce((a, b) => a + (b - mean) ** 2, 0) / grosses.length
  const std = Math.sqrt(variance)
  const cv = mean > 0 ? std / mean : 0
  return { value: cv, reason: 'computed', metadata: { mean, std, sample_size: grosses.length } }
}

// ---------- Helpers ----------

function sum(xs: number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

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
      .select('id, scores, total_gross, par_total, hole_pars, played_at, metadata')
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
    par_total: null,
    hole_pars: null,
    played_at: rl.fecha as string,
    metadata: null,
  }
}
