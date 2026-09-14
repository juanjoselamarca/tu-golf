/**
 * Utilidades server-side para billing.
 *
 * En server components no hay hooks. Este modulo exporta funciones
 * que pueden verificar acceso usando datos del servidor.
 */

import { canAccess } from './entitlements'
import type { Feature, Tier } from './plans'

/**
 * Verifica acceso a una feature en server components.
 *
 * En Fase 3, userTier vendra de profiles.tier en Supabase.
 * En marcha blanca, siempre retorna true.
 */
export function canAccessServer(
  feature: Feature,
  _userId?: string,
): boolean {
  // Fase 2: marcha blanca. No leemos tier de BD.
  const userTier: Tier = 'free'
  const paywallEnabled = false
  return canAccess(userTier, feature, paywallEnabled)
}
