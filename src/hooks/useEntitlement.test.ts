import { describe, it, expect } from 'vitest'
import { resolveEntitlement } from './useEntitlement'
import type { Subscription } from '@/lib/data/billing/subscription'

describe('resolveEntitlement', () => {
  it('loading mientras no hay suscripción cargada', () => {
    expect(resolveEntitlement(null, 'coach-plan', true)).toEqual({
      allowed: false,
      loading: true,
      tier: null,
    })
  })

  it('con suscripción pro y flag on, permite coach-plan', () => {
    const sub: Subscription = { tier: 'pro', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false }
    expect(resolveEntitlement(sub, 'coach-plan', true)).toEqual({
      allowed: true,
      loading: false,
      tier: 'pro',
    })
  })

  it('trialing con tier pro_plus permite la proyección', () => {
    const sub: Subscription = { tier: 'pro_plus', status: 'trialing', trialRoundsRemaining: 2, trialEndsAt: null, isFoundingMember: false }
    expect(resolveEntitlement(sub, 'season-projection', true)).toEqual({
      allowed: true,
      loading: false,
      tier: 'pro_plus',
    })
  })

  it('flag off permite todo aunque sea free', () => {
    const sub: Subscription = { tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false }
    expect(resolveEntitlement(sub, 'season-projection', false)).toEqual({
      allowed: true,
      loading: false,
      tier: 'free',
    })
  })

  it('free con flag on NO accede a gwi', () => {
    const sub: Subscription = { tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false }
    expect(resolveEntitlement(sub, 'gwi', true)).toEqual({
      allowed: false,
      loading: false,
      tier: 'free',
    })
  })
})
