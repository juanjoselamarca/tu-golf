/**
 * Utilidades server-side para billing.
 *
 * En server components no hay hooks. Este modulo exporta funciones
 * que pueden verificar acceso usando datos del servidor.
 *
 * Delega a checkFeatureAccess (fuente canónica) — "un concepto, una fuente".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { checkFeatureAccess } from './require-feature'
import type { Feature } from './plans'

/**
 * Verifica acceso a una feature en server components.
 * Wrapper boolean sobre checkFeatureAccess para server components
 * que solo necesitan un true/false.
 */
export async function canAccessServer(
  feature: Feature,
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await checkFeatureAccess(supabase, userId, feature)
  return result.allowed
}
