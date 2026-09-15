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

export async function getSubscription(supabase: SupabaseClient, userId: string): Promise<Subscription> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier, subscription_status, trial_rounds_remaining, trial_ends_at, is_founding_member, role')
    .eq('id', userId)
    .single()

  if (error || !data) return FREE_FALLBACK

  return {
    tier: (data.subscription_tier as Tier) ?? 'free',
    status: (data.subscription_status as SubscriptionStatus) ?? 'active',
    trialRoundsRemaining: data.trial_rounds_remaining ?? null,
    trialEndsAt: data.trial_ends_at ?? null,
    isFoundingMember: data.is_founding_member ?? false,
    isAdmin: data.role === 'admin',
  }
}
