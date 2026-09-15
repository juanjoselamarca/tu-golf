/**
 * Utilidades server-side para billing.
 *
 * En server components no hay hooks. Este modulo exporta funciones
 * que pueden verificar acceso usando datos del servidor.
 */

import { canAccess, type AccessContext } from './entitlements'
import type { Feature, Tier } from './plans'

/**
 * Verifica acceso a una feature en server components.
 *
 * En marcha blanca, siempre retorna true (paywallEnabled=false).
 * Cuando se active el paywall, leerá tier de BD.
 */
export function canAccessServer(
  feature: Feature,
  _userId?: string,
): boolean {
  const ctx: AccessContext = { tier: 'free' as Tier, status: 'active', isAdmin: false }
  const paywallEnabled = false
  return canAccess(ctx, feature, paywallEnabled)
}
