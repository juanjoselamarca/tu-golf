/**
 * Plan Effectiveness — KPIs agregados sobre el funnel de planes del cerebro.
 *
 * Métricas:
 *  - resolved_by_target_rate: planes resueltos por target_reached / total resueltos
 *  - adherence_distribution: % de outcomes full / partial / none / unknown
 *  - avg_days_to_resolution: días promedio entre plan_assigned y plan_resolved
 *  - per_pattern: por pattern_id, ratio de target alcanzado y tiempo medio
 *
 * Usado por el endpoint /api/admin/taiger/effectiveness.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §7.1
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EffectivenessKPIs {
  total_plans: number
  active_plans: number
  resolved_plans: number
  expired_plans: number
  superseded_plans: number
  cancelled_plans: number
  resolved_by_target_rate: number | null // resolved con target_reached_3_consecutive / total resolved
  adherence_distribution: {
    full: number
    partial: number
    none: number
    unknown: number
  }
  avg_days_to_resolution: number | null
  per_pattern: Array<{
    pattern_id: string
    total_plans: number
    resolved_count: number
    target_reached_count: number
    target_reached_rate: number
    avg_days_to_resolution: number | null
  }>
  total_outcomes: number
  total_users_with_plan: number
  generated_at: string
}

export async function computePlanEffectiveness(
  supabase: SupabaseClient,
): Promise<EffectivenessKPIs> {
  // Pull all plans + all outcomes. Para escalas <10K rondas/planes esto es OK
  // en un endpoint admin. Si crece, mover a vistas materializadas.
  const [plansRes, outcomesRes] = await Promise.all([
    supabase
      .from('coach_plans')
      .select('id, user_id, pattern_id, status, resolution_reason, created_at, resolved_at, duration_days'),
    supabase
      .from('plan_outcomes')
      .select('plan_id, target_reached, compliance, played_at'),
  ])

  type Plan = {
    id: string
    user_id: string
    pattern_id: string
    status: string
    resolution_reason: string | null
    created_at: string
    resolved_at: string | null
    duration_days: number
  }
  type Outcome = {
    plan_id: string
    target_reached: boolean
    compliance: 'full' | 'partial' | 'none' | 'unknown'
    played_at: string
  }

  const plans = (plansRes.data ?? []) as Plan[]
  const outcomes = (outcomesRes.data ?? []) as Outcome[]

  const total = plans.length
  const byStatus = countBy(plans, p => p.status)

  const resolvedPlans = plans.filter(p => p.status === 'resolved')
  const resolvedByTarget = resolvedPlans.filter(p => p.resolution_reason === 'target_reached_3_consecutive')

  const adherence = countBy(outcomes, o => o.compliance)

  // avg days resolved - assigned
  const dayDeltas = resolvedPlans
    .map(p => p.resolved_at ? daysBetween(p.created_at, p.resolved_at) : null)
    .filter((x): x is number => x !== null)
  const avgDays = dayDeltas.length > 0
    ? dayDeltas.reduce((a, b) => a + b, 0) / dayDeltas.length
    : null

  // per pattern
  const byPattern = new Map<string, Plan[]>()
  for (const p of plans) {
    if (!byPattern.has(p.pattern_id)) byPattern.set(p.pattern_id, [])
    byPattern.get(p.pattern_id)!.push(p)
  }

  const perPattern = Array.from(byPattern.entries()).map(([pattern_id, patternPlans]) => {
    const resolved = patternPlans.filter(p => p.status === 'resolved')
    const reached = resolved.filter(p => p.resolution_reason === 'target_reached_3_consecutive')
    const days = resolved
      .map(p => p.resolved_at ? daysBetween(p.created_at, p.resolved_at) : null)
      .filter((x): x is number => x !== null)
    return {
      pattern_id,
      total_plans: patternPlans.length,
      resolved_count: resolved.length,
      target_reached_count: reached.length,
      target_reached_rate: resolved.length > 0 ? reached.length / resolved.length : 0,
      avg_days_to_resolution: days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null,
    }
  }).sort((a, b) => b.total_plans - a.total_plans)

  const totalUsers = new Set(plans.map(p => p.user_id)).size

  return {
    total_plans: total,
    active_plans: byStatus.active ?? 0,
    resolved_plans: byStatus.resolved ?? 0,
    expired_plans: byStatus.expired ?? 0,
    superseded_plans: byStatus.superseded ?? 0,
    cancelled_plans: byStatus.cancelled ?? 0,
    resolved_by_target_rate: resolvedPlans.length > 0
      ? resolvedByTarget.length / resolvedPlans.length
      : null,
    adherence_distribution: {
      full: adherence.full ?? 0,
      partial: adherence.partial ?? 0,
      none: adherence.none ?? 0,
      unknown: adherence.unknown ?? 0,
    },
    avg_days_to_resolution: avgDays,
    per_pattern: perPattern,
    total_outcomes: outcomes.length,
    total_users_with_plan: totalUsers,
    generated_at: new Date().toISOString(),
  }
}

function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of xs) {
    const k = key(x)
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return ms / (1000 * 60 * 60 * 24)
}
