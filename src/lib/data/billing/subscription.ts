// Capa de acceso a la suscripción del usuario.
// Patrón: recibe el cliente por parámetro (como src/lib/data/tournaments/).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tier } from '@/golf/billing/plans'

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'

export interface Subscription {
  tier: Tier
  status: SubscriptionStatus
  trialRoundsRemaining: number | null
  trialEndsAt: string | null
  isFoundingMember: boolean
  isAdmin: boolean
}

const FREE_FALLBACK: Subscription = {
  tier: 'free',
  status: 'active',
  trialRoundsRemaining: null,
  trialEndsAt: null,
  isFoundingMember: false,
  isAdmin: false,
}

/**
 * No se pudo LEER el plan (red, timeout, RLS, Supabase caído). Es distinto de
 * "no hay fila": eso es un usuario free y se resuelve sin error.
 *
 * Cada gate decide qué hacer con la duda. Los de contenido premium (coach,
 * stats, cupos, invitados) siguen cerrados (`checkFeatureAccess` y
 * `useEntitlement` responden "sin acceso"); el gate del modo neto NO convierte
 * la duda en gross: el cliente no coacciona y el servidor responde 503.
 */
export class SubscriptionReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubscriptionReadError'
  }
}

/** Código de PostgREST para `.single()` sin filas. */
const PGRST_SIN_FILAS = 'PGRST116'

/**
 * Plan del usuario. Sin fila en `profiles` → free. Error de lectura → lanza
 * `SubscriptionReadError` (nunca se disfraza de free: un Pro sin señal no es un free).
 */
export async function getSubscription(supabase: SupabaseClient, userId: string): Promise<Subscription> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier, subscription_status, trial_rounds_remaining, trial_ends_at, is_founding_member, role')
    .eq('id', userId)
    .single()

  if (error) {
    if (error.code === PGRST_SIN_FILAS) return FREE_FALLBACK
    throw new SubscriptionReadError(error.message || 'No se pudo leer el plan')
  }
  if (!data) return FREE_FALLBACK

  return {
    tier: (data.subscription_tier as Tier) ?? 'free',
    status: (data.subscription_status as SubscriptionStatus) ?? 'active',
    trialRoundsRemaining: data.trial_rounds_remaining ?? null,
    trialEndsAt: data.trial_ends_at ?? null,
    isFoundingMember: data.is_founding_member ?? false,
    isAdmin: data.role === 'admin',
  }
}
