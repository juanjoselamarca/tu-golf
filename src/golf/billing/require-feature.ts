/**
 * Verificación server-side de acceso a features de billing.
 *
 * Combina getSubscription (I/O) con canAccess (pura) y devuelve
 * un resultado rico para que el caller pueda construir mensajes de upsell.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSubscription } from '@/lib/data/billing/subscription'
import { canAccess, isPaywallEnabled, type AccessContext } from './entitlements'
import { FEATURE_MIN_TIER, type Feature, type NetoFeature } from './plans'
import { featureDelModo, MENSAJE_NETO_PRO } from './modo-por-plan'

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

/** Rechazo del gate de modo: cuerpo del 403 que devuelven las rutas de creación. */
export interface ModoProRequerido {
  error: 'pro_required'
  feature: NetoFeature
  requiredTier: string
  message: string
}

/**
 * Gate de servidor del modo de scoring (gross libre; neto de los formatos de
 * `NETO_FEATURE_BY_FORMAT` exige Pro). Lo corre TODO camino que crea una
 * ronda o un torneo. Devuelve `null` si se puede jugar así, o el cuerpo del
 * 403 `pro_required` si no. Gross no consulta la suscripción.
 */
export async function checkModoAccess(
  supabase: SupabaseClient,
  userId: string,
  formato: string,
  modo: string,
): Promise<ModoProRequerido | null> {
  const feature = featureDelModo(formato, modo)
  if (!feature) return null
  const access = await checkFeatureAccess(supabase, userId, feature)
  if (access.allowed) return null
  return { error: 'pro_required', feature, requiredTier: access.requiredTier, message: MENSAJE_NETO_PRO }
}
