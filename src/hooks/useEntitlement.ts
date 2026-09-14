'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSubscription, type Subscription } from '@/lib/data/billing/subscription'
import { canAccess, isPaywallEnabled } from '@/golf/billing/entitlements'
import type { Feature, Tier } from '@/golf/billing/plans'

export interface EntitlementResult {
  allowed: boolean
  loading: boolean
  tier: Tier | null
}

/** Lógica pura del hook (testeable sin React). */
export function resolveEntitlement(
  sub: Subscription | null,
  feature: Feature,
  paywallEnabled: boolean,
): EntitlementResult {
  if (sub === null) return { allowed: false, loading: true, tier: null }
  return {
    allowed: canAccess(sub.tier, feature, paywallEnabled),
    loading: false,
    tier: sub.tier,
  }
}

/** Hook React: carga la suscripción del usuario actual y resuelve el acceso. */
export function useEntitlement(feature: Feature): EntitlementResult {
  const [sub, setSub] = useState<Subscription | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (active) setSub({ tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false })
        return
      }
      const s = await getSubscription(supabase, user.id)
      if (active) setSub(s)
    })()
    return () => { active = false }
  }, [])

  return resolveEntitlement(sub, feature, isPaywallEnabled())
}
