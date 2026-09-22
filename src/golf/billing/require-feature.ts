/**
 * Verificación server-side de acceso a features de billing.
 *
 * Combina getSubscription (I/O) con canAccess (pura) y devuelve
 * un resultado rico para que el caller pueda construir mensajes de upsell.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSubscription } from '@/lib/data/billing/subscription'
import { canAccess, isPaywallEnabled, type AccessContext } from './entitlements'
import { FEATURE_MIN_TIER, type Feature } from './plans'

export interface FeatureAccessResult {
  allowed: boolean
  tier: string
  requiredTier: string
}

export async function checkFeatureAccess(
  supabase: SupabaseClient,
  userId: string,
  feature: Feature,
): Promise<FeatureAccessResult> {
  const sub = await getSubscription(supabase, userId)
  const ctx: AccessContext = {
    tier: sub.tier,
    status: sub.status,
    isAdmin: sub.isAdmin,
  }
  return {
    allowed: canAccess(ctx, feature, isPaywallEnabled()),
    tier: sub.tier,
    requiredTier: FEATURE_MIN_TIER[feature],
  }
}
