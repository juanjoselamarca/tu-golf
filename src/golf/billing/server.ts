/**
 * Utilidades server-side para billing.
 *
 * En server components no hay hooks. Este modulo exporta funciones
 * que pueden verificar acceso usando datos del servidor.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSubscription } from '@/lib/data/billing/subscription'
import { canAccess, isPaywallEnabled, type AccessContext } from './entitlements'
import type { Feature } from './plans'

/**
 * Verifica acceso a una feature en server components.
 *
 * Lee el tier real del usuario desde la BD (tabla profiles).
 * Usa el mismo paywall flag que el cliente (NEXT_PUBLIC_PAYWALL_ENABLED).
 */
export async function canAccessServer(
  feature: Feature,
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const sub = await getSubscription(supabase, userId)
  const ctx: AccessContext = {
    tier: sub.tier,
    status: sub.status,
    isAdmin: sub.isAdmin,
  }
  return canAccess(ctx, feature, isPaywallEnabled())
}
