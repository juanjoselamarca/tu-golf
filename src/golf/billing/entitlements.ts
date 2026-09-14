// Decisión PURA de acceso (sin I/O).
// El flag se inyecta por parámetro para que sea trivialmente testeable.
import { TIER_RANK, FEATURE_MIN_TIER, type Tier, type Feature } from './plans'

/**
 * ¿El usuario con este tier puede acceder a esta feature?
 * Si paywallEnabled es false, todo está permitido (comportamiento pre-paywall).
 */
export function canAccess(tier: Tier, feature: Feature, paywallEnabled: boolean): boolean {
  if (!paywallEnabled) return true
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

/** Lee el flag global del paywall desde env. Off por default (seguro). */
export function isPaywallEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYWALL_ENABLED === 'true'
}
