import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSubscription } from './subscription'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as unknown as Parameters<typeof getSubscription>[0]
beforeEach(() => { mockFrom.mockReset() })

describe('getSubscription', () => {
  it('lee tier, status y founding member del profile', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({
      data: {
        subscription_tier: 'pro',
        subscription_status: 'active',
        trial_rounds_remaining: null,
        trial_ends_at: null,
        is_founding_member: true,
      },
      error: null,
    })
    mockFrom.mockReturnValue({ select, eq, single })

    const out = await getSubscription(mockSupabase, 'user-1')

    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(out).toEqual({
      tier: 'pro',
      status: 'active',
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: true,
    })
  })

  it('si no hay fila o hay error, devuelve free/active (fallback seguro)', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } })
    mockFrom.mockReturnValue({ select, eq, single })

    const out = await getSubscription(mockSupabase, 'user-x')
    expect(out).toEqual({
      tier: 'free',
      status: 'active',
      trialRoundsRemaining: null,
      trialEndsAt: null,
      isFoundingMember: false,
    })
  })

  it('trialing con rondas restantes', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({
      data: {
        subscription_tier: 'pro_plus',
        subscription_status: 'trialing',
        trial_rounds_remaining: 2,
        trial_ends_at: '2026-10-01T00:00:00Z',
        is_founding_member: false,
      },
      error: null,
    })
    mockFrom.mockReturnValue({ select, eq, single })

    const out = await getSubscription(mockSupabase, 'user-trial')
    expect(out).toEqual({
      tier: 'pro_plus',
      status: 'trialing',
      trialRoundsRemaining: 2,
      trialEndsAt: '2026-10-01T00:00:00Z',
      isFoundingMember: false,
    })
  })
})
