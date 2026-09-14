// Decisión PURA de acceso (sin I/O).
// El flag se inyecta por parámetro para que sea trivialmente testeable.
import { TIER_RANK, FEATURE_MIN_TIER, type Tier, type Feature } from './plans'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'

/** Status que permiten acceso (active y trialing). past_due tiene gracia. */
const ALLOWED_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due']

export interface AccessContext {
  tier: Tier
  status: SubscriptionStatus
  isAdmin: boolean
}

/**
 * ¿El usuario puede acceder a esta feature?
 * - paywallEnabled=false → todo permitido (comportamiento pre-paywall)
 * - isAdmin=true → siempre permitido (admin bypass)
 * - status cancelado/pausado → denegado aunque tenga tier
 * - tier >= tier mínimo del feature → permitido
 */
export function canAccess(
  ctx: AccessContext,
  feature: Feature,
  paywallEnabled: boolean,
): boolean {
  if (!paywallEnabled) return true
  if (ctx.isAdmin) return true
  if (!ALLOWED_STATUSES.includes(ctx.status)) return false
  return TIER_RANK[ctx.tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

/**
 * Overload simple para backwards compatibility (tests existentes).
 * Asume status=active, isAdmin=false.
 */
export function canAccessSimple(tier: Tier, feature: Feature, paywallEnabled: boolean): boolean {
  return canAccess({ tier, status: 'active', isAdmin: false }, feature, paywallEnabled)
}

/** Lee el flag global del paywall desde env. Off por default (seguro). */
export function isPaywallEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYWALL_ENABLED === 'true'
}
