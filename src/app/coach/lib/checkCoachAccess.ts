import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { canAccessServer } from '@/golf/billing/server'
import { isPaywallEnabled } from '@/golf/billing/entitlements'

/**
 * ¿Está este usuario en la BETA del coach (código TAIGER25 → coach_access_enabled)?
 * Es UNA de las dos puertas de `canUseCoach`; para decidir acceso usar siempre
 * `canUseCoach`, nunca esto solo.
 */
export async function hasCoachAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('coach_access_enabled')
    .eq('id', userId)
    .maybeSingle()
  return data?.coach_access_enabled === true
}

/**
 * ¿Puede USAR el coach? FUENTE ÚNICA para las tres capas: /coach (page.tsx), sus
 * sub-rutas (checkCoachAccess en los layouts) y los endpoints que gastan IA.
 *
 * Regla (decisión de producto de Juanjo, 03-oct-2026): acceso = BETA (código
 * TAIGER25 → coach_access_enabled) **O** plan pago con tier suficiente para la
 * feature `'coach-plan'` (FEATURE_MIN_TIER, hoy 'pro'). El plan se evalúa con la
 * fuente canónica del servidor (`canAccessServer` → checkFeatureAccess →
 * canAccess: tier, status de la suscripción, admin), no con una segunda lógica.
 *
 * El camino del plan sólo cuenta con el paywall ENCENDIDO: con el paywall apagado
 * `canAccess` deja pasar todo ("pre-paywall") y nadie pagó nada, así que eso
 * abriría el coach —que gasta IA— a todos los usuarios. Apagado, la beta es la
 * única puerta (igual que antes de esta regla).
 *
 * Historia: 01-oct-2026 la regla era "sólo beta" (se unificaron /coach, que pedía
 * plan + beta, y las sub-rutas, que pedían sólo beta).
 */
export async function canUseCoach(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (await hasCoachAccess(supabase, userId)) return true
  // Paywall OFF → sólo la beta. Deliberado por costo de IA, con dos efectos sabidos:
  // (1) un admin SIN beta queda fuera del coach (el bypass de admin vive en el camino
  // del plan); (2) si se apaga el flag como kill-switch, los PRO sin beta pierden el
  // coach mientras dure. Para un admin, activar su beta (TAIGER25).
  if (!isPaywallEnabled()) return false
  return canAccessServer('coach-plan', supabase, userId)
}

/**
 * Guard para sub-rutas del coach. Redirige a /coach (pantalla gate) si no tiene acceso.
 */
export async function checkCoachAccess(): Promise<void> {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/coach')

  if (!(await canUseCoach(supabase, user.id))) {
    redirect('/coach')
  }
}
