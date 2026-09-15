import { describe, it, expect } from 'vitest'
import { resolveEntitlement } from './useEntitlement'
import type { Subscription } from '@/lib/data/billing/subscription'

const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false, isAdmin: false,
  ...overrides,
})

describe('resolveEntitlement', () => {
  it('loading mientras no hay suscripción cargada', () => {
    expect(resolveEntitlement(null, 'coach-plan', true)).toEqual({
      allowed: false, loading: true, tier: null,
    })
  })

  it('pro activo permite coach-plan', () => {
    expect(resolveEntitlement(sub({ tier: 'pro' }), 'coach-plan', true)).toEqual({
      allowed: true, loading: false, tier: 'pro',
    })
  })

  it('pro_plus trialing permite proyección', () => {
    expect(resolveEntitlement(sub({ tier: 'pro_plus', status: 'trialing', trialRoundsRemaining: 2 }), 'season-projection', true)).toEqual({
      allowed: true, loading: false, tier: 'pro_plus',
    })
  })

  it('flag off permite todo', () => {
    expect(resolveEntitlement(sub(), 'season-projection', false)).toEqual({
      allowed: true, loading: false, tier: 'free',
    })
  })

  it('free con flag on NO accede a gwi', () => {
    expect(resolveEntitlement(sub(), 'gwi', true)).toEqual({
      allowed: false, loading: false, tier: 'free',
    })
  })

  it('pro cancelado NO accede', () => {
    expect(resolveEntitlement(sub({ tier: 'pro', status: 'canceled' }), 'coach-plan', true)).toEqual({
      allowed: false, loading: false, tier: 'pro',
    })
  })

  it('admin free accede a todo', () => {
    expect(resolveEntitlement(sub({ isAdmin: true }), 'season-projection', true)).toEqual({
      allowed: true, loading: false, tier: 'free',
    })
  })
})
