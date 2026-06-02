/**
 * Lifecycle de los planes del coach (cerebro v2/v3).
 *
 * Un plan tiene una ventana (created_at + duration_days). Pasada la ventana sin
 * resolverse, sigue figurando como `active` y el coach lo muestra como vigente —
 * dato incorrecto (el plan de Juanjo venció el 28-may y seguía "activo"). Esto lo
 * cierra: marca los vencidos como `expired` para que el coach proponga un foco
 * fresco. Idempotente y seguro (sólo toca planes genuinamente fuera de ventana).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabaseAdmin'

const DAY_MS = 86_400_000

export interface PlanWindow {
  created_at: string
  duration_days: number | null
}

/** ¿El plan ya pasó su ventana? duration_days nulo se trata como 0. */
export function isPlanExpired(plan: PlanWindow, now: Date): boolean {
  const created = new Date(plan.created_at).getTime()
  if (!Number.isFinite(created)) return false
  const windowMs = (plan.duration_days ?? 0) * DAY_MS
  return created + windowMs < now.getTime()
}

/**
 * Cierra los planes activos vencidos del usuario. Update vía cliente del request
 * (RLS permite al dueño), evento de auditoría vía service_role.
 */
export async function closeExpiredPlans(
  supabase: SupabaseClient,
  userId: string,
  admin: SupabaseClient = createAdminClient(),
  now: Date = new Date(),
): Promise<{ expired: string[] }> {
  const { data: plans, error } = await supabase
    .from('coach_plans')
    .select('id, created_at, duration_days')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (error || !plans) return { expired: [] }

  const expired: string[] = []
  for (const p of plans as Array<{ id: string } & PlanWindow>) {
    if (!isPlanExpired(p, now)) continue
    const { error: updErr } = await supabase
      .from('coach_plans')
      .update({
        status: 'expired',
        resolution_reason: 'window_elapsed',
        resolved_at: now.toISOString(),
      })
      .eq('id', p.id)
      .eq('status', 'active') // re-check anti-carrera
    if (updErr) continue
    expired.push(p.id)
    // Auditoría best-effort (no romper el cierre por un fallo de evento).
    await admin
      .from('coach_events')
      .insert({
        user_id: userId,
        type: 'plan_expired',
        payload: { plan_id: p.id, reason: 'window_elapsed' },
        related_plan_id: p.id,
      })
      .then(undefined, () => undefined)
  }
  return { expired }
}
