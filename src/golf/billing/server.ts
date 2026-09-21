/**
 * Utilidades server-side para billing.
 *
 * En server components no hay hooks. Este modulo exporta funciones
 * que pueden verificar acceso usando datos del servidor.
 */

import { canAccess, isPaywallEnabled, type AccessContext } from './entitlements'
import type { Feature, Tier } from './plans'

/**
 * Verifica acceso a una feature en server components.
 *
 * Lee NEXT_PUBLIC_PAYWALL_ENABLED igual que el cliente. Sin tier de BD
 * por ahora — todos los usuarios son free hasta que haya pasarela.
 */
export function canAccessServer(
  feature: Feature,
  _userId?: string,
): boolean {
  const ctx: AccessContext = { tier: 'free' as Tier, status: 'active', isAdmin: false }
  return canAccess(ctx, feature, isPaywallEnabled())
}
