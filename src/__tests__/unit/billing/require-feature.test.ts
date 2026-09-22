import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Mock before importing the module under test
vi.mock('@/lib/data/billing/subscription', () => ({
  getSubscription: vi.fn(),
}))

vi.mock('@/golf/billing/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/golf/billing/entitlements')>()
  return {
    ...actual,
    isPaywallEnabled: vi.fn(),
  }
})

import { checkFeatureAccess } from '@/golf/billing/require-feature'
import { getSubscription } from '@/lib/data/billing/subscription'
import { isPaywallEnabled } from '@/golf/billing/entitlements'
import type { Subscription } from '@/lib/data/billing/subscription'

const mockGetSubscription = vi.mocked(getSubscription)
const mockIsPaywallEnabled = vi.mocked(isPaywallEnabled)

// Fake supabase client — not used directly in the function (passed to getSubscription)
const fakeSupabase = {} as SupabaseClient
const USER_ID = 'user-123'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkFeatureAccess', () => {
  it('denies free user when paywall is on', async () => {
    mockIsPaywallEnabled.mockReturnValue(true)
    mockGetSubscription.mockResolvedValue({
      tier: 'free',
      status: 'active',
      isAdmin: false,
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: false,
    } satisfies Subscription)

    const result = await checkFeatureAccess(fakeSupabase, USER_ID, 'coach-plan')

    expect(result.allowed).toBe(false)
    expect(result.tier).toBe('free')
    expect(result.requiredTier).toBe('pro')
  })

  it('allows pro user to access a pro feature', async () => {
    mockIsPaywallEnabled.mockReturnValue(true)
    mockGetSubscription.mockResolvedValue({
      tier: 'pro',
      status: 'active',
      isAdmin: false,
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: false,
    } satisfies Subscription)

    const result = await checkFeatureAccess(fakeSupabase, USER_ID, 'coach-plan')

    expect(result.allowed).toBe(true)
    expect(result.tier).toBe('pro')
  })

  it('admin bypass: free admin can access pro feature', async () => {
    mockIsPaywallEnabled.mockReturnValue(true)
    mockGetSubscription.mockResolvedValue({
      tier: 'free',
      status: 'active',
      isAdmin: true,
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: false,
    } satisfies Subscription)

    const result = await checkFeatureAccess(fakeSupabase, USER_ID, 'coach-plan')

    expect(result.allowed).toBe(true)
  })

  it('denies pro user with status canceled', async () => {
    mockIsPaywallEnabled.mockReturnValue(true)
    mockGetSubscription.mockResolvedValue({
      tier: 'pro',
      status: 'canceled',
      isAdmin: false,
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: false,
    } satisfies Subscription)

    const result = await checkFeatureAccess(fakeSupabase, USER_ID, 'coach-plan')

    expect(result.allowed).toBe(false)
  })

  it('paywall off allows everything regardless of tier', async () => {
    mockIsPaywallEnabled.mockReturnValue(false)
    mockGetSubscription.mockResolvedValue({
      tier: 'free',
      status: 'active',
      isAdmin: false,
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: false,
    } satisfies Subscription)

    const result = await checkFeatureAccess(fakeSupabase, USER_ID, 'coach-plan')

    expect(result.allowed).toBe(true)
  })
})
