import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActivePlan {
  id: string;
  user_id: string;
  status: string;
  pattern_id: string;
  hypothesis: string | null;
  metric: string | null;
  target_value: number | null;
  target_op: string | null;
  baseline_value: number | null;
  duration_days: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PlanOutcome {
  id: number;
  plan_id: string;
  user_id: string;
  actual_value: number | null;
  delta_vs_target: number | null;
  round_id?: string | null;
  historical_round_id?: string | null;
  created_at: string;
}

/**
 * Devuelve el plan en estado `active` del usuario (1 por user, garantizado por
 * UNIQUE INDEX `coach_plans_one_active_per_user` en migration 034).
 */
export async function getActivePlan(
  sb: SupabaseClient,
  userId: string,
): Promise<ActivePlan | null> {
  const { data, error } = await sb
    .from('coach_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ActivePlan | null;
}

/**
 * Devuelve el plan más reciente en `resolved` o `expired` dentro de la ventana
 * (default 7 días). Útil para mostrar "plan completado, esperando el próximo".
 */
export async function getRecentCompletedPlan(
  sb: SupabaseClient,
  userId: string,
  daysWindow = 7,
): Promise<ActivePlan | null> {
  const cutoff = new Date(Date.now() - daysWindow * 86_400_000).toISOString();
  const { data, error } = await sb
    .from('coach_plans')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['resolved', 'expired'])
    .gte('resolved_at', cutoff)
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ActivePlan | null;
}

/**
 * Última fila de `plan_outcomes` para un plan dado. Cerebro v2 inserta una fila
 * por cada ronda nueva del usuario contra el plan activo.
 */
export async function getLatestPlanOutcome(
  sb: SupabaseClient,
  planId: string,
): Promise<PlanOutcome | null> {
  const { data, error } = await sb
    .from('plan_outcomes')
    .select('*')
    .eq('plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as PlanOutcome | null;
}
