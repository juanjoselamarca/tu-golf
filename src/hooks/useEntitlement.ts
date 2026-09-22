'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSubscription, type Subscription } from '@/lib/data/billing/subscription'
import { canAccess, isPaywallEnabled, type AccessContext } from '@/golf/billing/entitlements'
import { hasMasterOverride } from '@/golf/billing/master-code'
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
  const ctx: AccessContext = {
    tier: sub.tier,
    status: sub.status,
    isAdmin: sub.isAdmin,
  }
  return {
    allowed: canAccess(ctx, feature, paywallEnabled),
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
        if (active) setSub({ tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false, isAdmin: false })
        return
      }
      const s = await getSubscription(supabase, user.id)
      if (active) setSub(s)
    })()
    return () => { active = false }
  }, [])

  const result = resolveEntitlement(sub, feature, isPaywallEnabled())

  // Master code override: eleva tier a pro pero respeta status
  if (!result.loading && !result.allowed && hasMasterOverride() && sub) {
    const elevatedCtx: AccessContext = {
      tier: 'pro',
      status: sub.status, // respeta canceled/paused
      isAdmin: sub.isAdmin,
    }
    const elevated = canAccess(elevatedCtx, feature, isPaywallEnabled())
    if (elevated) return { ...result, allowed: true }
  }

  return result
}
