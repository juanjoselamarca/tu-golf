/**
 * Agregador del dashboard de progreso (cerebro v3, Ola 2). Reúne, para la vista
 * `/coach/progreso`, el foco actual + la serie de métricas relativas + el plan
 * activo + la meta — todo desde piezas ya testeadas. Handler del API queda delgado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFocus, defaultFocusDeps } from '@/golf/coach/v3/focus'
import type { FocusResult, FocusTarget } from '@/golf/coach/v3/focus'
import { loadFocusTarget } from '@/lib/data/focus'
import { backfillRoundMetrics } from './round-metrics'

export interface RoundMetricJoinRow {
  strokes_over_par_round: number
  delta_vs_handicap_expected: number
  delta_vs_target_handicap: number | null
  historical_rounds: { played_at: string | null } | Array<{ played_at: string | null }> | null
}

export interface SeriePunto {
  played_at: string | null
  strokes_over_par_round: number
  delta_vs_handicap_expected: number
  delta_vs_target_handicap: number | null
}

export interface ProgressDashboard {
  focus: FocusResult
  target: FocusTarget
  serie: SeriePunto[]
  activePlan: Record<string, unknown> | null
  outcomes: unknown[]
}

/** Aplana el join de Supabase (objeto o array) y ordena cronológico ascendente. */
export function shapeSeries(rows: RoundMetricJoinRow[]): SeriePunto[] {
  return rows
    .map((r) => {
      const hr = Array.isArray(r.historical_rounds) ? r.historical_rounds[0] : r.historical_rounds
      return {
        played_at: hr?.played_at ?? null,
        strokes_over_par_round: r.strokes_over_par_round,
        delta_vs_handicap_expected: r.delta_vs_handicap_expected,
        delta_vs_target_handicap: r.delta_vs_target_handicap,
      }
    })
    .sort((a, b) => (a.played_at ?? '').localeCompare(b.played_at ?? ''))
}

export async function loadProgressDashboard(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
): Promise<ProgressDashboard> {
  // Autopobla métricas faltantes (best-effort, no rompe la vista).
  try {
    await backfillRoundMetrics(admin, userId)
  } catch {
    /* best-effort */
  }

  const [focus, target, metricsRes, planRes] = await Promise.all([
    getFocus(userId, defaultFocusDeps(supabase)),
    loadFocusTarget(supabase, userId),
    supabase
      .from('round_metrics')
      .select(
        'strokes_over_par_round, delta_vs_handicap_expected, delta_vs_target_handicap, historical_rounds(played_at)',
      )
      .eq('user_id', userId),
    supabase
      .from('coach_plans')
      .select('id, pattern_id, metric, target_value, target_op, baseline_value, created_at, duration_days')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const serie = shapeSeries((metricsRes.data ?? []) as unknown as RoundMetricJoinRow[])
  const activePlan = (planRes.data ?? null) as Record<string, unknown> | null

  let outcomes: unknown[] = []
  const planId = (activePlan as { id?: string } | null)?.id
  if (planId) {
    const outRes = await supabase
      .from('plan_outcomes')
      .select('played_at, metric_value, delta_vs_baseline, target_reached, compliance')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .order('played_at', { ascending: false })
      .limit(10)
    outcomes = outRes.data ?? []
  }

  return { focus, target, serie, activePlan, outcomes }
}
