/**
 * Plan Engine — handler de la tool `save_plan` de tAIger+.
 *
 * Llamado desde executeTool('save_plan', input, ctx) en tools.ts.
 *
 * Reglas duras:
 *  - Solo 1 plan active por usuario (partial unique index lo enforce; igual
 *    superseded la previa explícitamente para que el lifecycle sea limpio).
 *  - El INSERT a coach_events requiere service_role (no hay policy de INSERT).
 *  - El UPDATE/INSERT a coach_plans usa el cliente del usuario (RLS lo permite).
 *  - baseline_value se setea SIEMPRE desde observation_data.metric_value.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.4.2
 * Schema: supabase/migrations/034_cerebro_foundation.sql
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'

export const PATTERN_IDS = [
  'back_nine_collapse',
  'front_nine_struggles',
  'first_hole_anxiety',
  'par_3_weakness',
  'short_game_weakness',
  'post_bogey_spiral',
  'three_putt_frequency',
  'pressure_deterioration',
  'driving_inconsistency',
] as const
export type PatternId = (typeof PATTERN_IDS)[number]

export const PLAN_METRICS = [
  'back9_minus_front9_strokes',
  'avg_first_hole_score',
  'par3_avg_vs_par',
  'three_putts_per_round',
  'post_bogey_score_avg',
  'double_or_worse_pct',
  'last4holes_minus_rest_strokes',
  'total_gross_cv',
  'short_game_strokes_per_round',
] as const
export type PlanMetric = (typeof PLAN_METRICS)[number]

export type TargetOp = 'lte' | 'gte' | 'eq'

export interface SavePlanInput {
  pattern_id: PatternId
  observation_data: {
    data_points: number
    metric_value: number
    confidence: number
  }
  hypothesis: string
  plan: {
    rule: string
    metric: PlanMetric
    target_value: number
    target_op: TargetOp
    duration_days: number
  }
}

export interface SavePlanContext {
  supabase: SupabaseClient
  userId: string
  sessionId?: string | null
}

export type SavePlanResult =
  | { ok: true; plan_id: string; superseded_plan_id: string | null; summary: string }
  | { ok: false; error: string }

export async function savePlan(
  ctx: SavePlanContext,
  input: SavePlanInput,
): Promise<SavePlanResult> {
  const { supabase, userId, sessionId } = ctx

  // 1) Plan activo previo (si lo hay) → marcar como superseded.
  const { data: existing, error: existingErr } = await supabase
    .from('coach_plans')
    .select('id, pattern_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (existingErr) {
    return { ok: false, error: `Error leyendo plan activo: ${existingErr.message}` }
  }

  let supersededId: string | null = null
  if (existing) {
    const samePattern = existing.pattern_id === input.pattern_id
    const reason = samePattern ? 'pattern_refined' : 'higher_priority_pattern'
    const { error: updErr } = await supabase
      .from('coach_plans')
      .update({
        status: 'superseded',
        resolution_reason: reason,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', 'active') // re-check para evitar carrera con otro plan recién insertado

    if (updErr) {
      return { ok: false, error: `Error superseding plan previo: ${updErr.message}` }
    }
    supersededId = existing.id
  }

  // 2) Insert del plan nuevo. baseline_value desde observation_data.metric_value.
  const { data: inserted, error: insErr } = await supabase
    .from('coach_plans')
    .insert({
      user_id: userId,
      pattern_id: input.pattern_id,
      pattern_version: 1,
      hypothesis: input.hypothesis,
      rule: input.plan.rule,
      metric: input.plan.metric,
      target_value: input.plan.target_value,
      target_op: input.plan.target_op,
      baseline_value: input.observation_data.metric_value,
      duration_days: input.plan.duration_days,
      status: 'active',
      observation_data: input.observation_data,
      assigned_by: 'tAIger',
      session_id: sessionId ?? null,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    return { ok: false, error: `Error insertando plan nuevo: ${insErr?.message ?? 'sin id'}` }
  }

  const planId = inserted.id

  // 3) Event sourcing: plan_assigned via service_role (RLS bloquea inserts directos).
  const admin = createAdminClient()
  const { error: evtErr } = await admin
    .from('coach_events')
    .insert({
      user_id: userId,
      type: 'plan_assigned',
      payload: {
        plan_id: planId,
        pattern_id: input.pattern_id,
        hypothesis: input.hypothesis,
        rule: input.plan.rule,
        metric: input.plan.metric,
        target_value: input.plan.target_value,
        target_op: input.plan.target_op,
        baseline_value: input.observation_data.metric_value,
        duration_days: input.plan.duration_days,
        observation_data: input.observation_data,
        superseded_plan_id: supersededId,
      },
      related_plan_id: planId,
      related_session_id: sessionId ?? null,
    })

  if (evtErr) {
    // No fallar la tool por un error de auditoría — solo loggear. El plan ya se asignó.
    console.error('[plan-engine] coach_events plan_assigned falló:', evtErr.message)
  }

  if (supersededId) {
    await admin
      .from('coach_events')
      .insert({
        user_id: userId,
        type: 'plan_superseded',
        payload: {
          superseded_plan_id: supersededId,
          new_plan_id: planId,
          reason: existing?.pattern_id === input.pattern_id ? 'pattern_refined' : 'higher_priority_pattern',
        },
        related_plan_id: planId,
        related_session_id: sessionId ?? null,
      })
  }

  return {
    ok: true,
    plan_id: planId,
    superseded_plan_id: supersededId,
    summary: supersededId
      ? `Plan asignado para ${input.pattern_id}. Plan previo superseded.`
      : `Plan asignado para ${input.pattern_id}.`,
  }
}
