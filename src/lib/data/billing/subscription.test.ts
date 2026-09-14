import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSubscription } from './subscription'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof getSubscription>[0]
beforeEach(() => { mockFrom.mockReset() })

function mockQuery(data: Record<string, unknown> | null, error: { message: string } | null = null) {
  const select = vi.fn().mockReturnThis()
  const eq = vi.fn().mockReturnThis()
  const single = vi.fn().mockResolvedValue({ data, error })
  mockFrom.mockReturnValue({ select, eq, single })
  return { select, eq }
}

describe('getSubscription', () => {
  it('lee tier, status, founding y admin del profile', async () => {
    mockQuery({
      subscription_tier: 'pro',
      subscription_status: 'active',
      trial_rounds_remaining: null,
      trial_ends_at: null,
      is_founding_member: true,
      role: 'admin',
    })

    const out = await getSubscription(mockSupabase, 'user-1')
    expect(out).toEqual({
      tier: 'pro', status: 'active', trialRoundsRemaining: null, trialEndsAt: null,
      isFoundingMember: true, isAdmin: true,
    })
  })

  it('fallback seguro si no hay fila', async () => {
    mockQuery(null, { message: 'no rows' })
    const out = await getSubscription(mockSupabase, 'user-x')
    expect(out).toEqual({
      tier: 'free', status: 'active', trialRoundsRemaining: null, trialEndsAt: null,
      isFoundingMember: false, isAdmin: false,
    })
  })

  it('trialing con rondas restantes', async () => {
    mockQuery({
      subscription_tier: 'pro_plus',
      subscription_status: 'trialing',
      trial_rounds_remaining: 2,
      trial_ends_at: '2026-10-01T00:00:00Z',
      is_founding_member: false,
      role: 'user',
    })
    const out = await getSubscription(mockSupabase, 'user-trial')
    expect(out).toEqual({
      tier: 'pro_plus', status: 'trialing', trialRoundsRemaining: 2,
      trialEndsAt: '2026-10-01T00:00:00Z', isFoundingMember: false, isAdmin: false,
    })
  })

  it('role no-admin = isAdmin false', async () => {
    mockQuery({
      subscription_tier: 'free', subscription_status: 'active',
      trial_rounds_remaining: null, trial_ends_at: null,
      is_founding_member: false, role: 'user',
    })
    const out = await getSubscription(mockSupabase, 'user-normal')
    expect(out.isAdmin).toBe(false)
  })
})
