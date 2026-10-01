import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/golf/billing/server', () => ({ canAccessServer: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/getPageUser', () => ({ getPageUser: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { canAccessServer } from '@/golf/billing/server'
import { canUseCoach } from './checkCoachAccess'

function supabaseCon(coachAccessEnabled: boolean | null): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: coachAccessEnabled === null ? null : { coach_access_enabled: coachAccessEnabled } }),
  }
  return { from: () => chain } as unknown as SupabaseClient
}

describe('canUseCoach — mismo doble gate que /coach (plan + beta)', () => {
  beforeEach(() => vi.mocked(canAccessServer).mockReset())

  it('plan sí + beta sí → puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(true)
    expect(await canUseCoach(supabaseCon(true), 'u')).toBe(true)
  })

  it('plan sí + beta no → no puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(true)
    expect(await canUseCoach(supabaseCon(false), 'u')).toBe(false)
  })

  it('plan no → no puede aunque tenga beta (y no consulta la beta)', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    expect(await canUseCoach(supabaseCon(true), 'u')).toBe(false)
  })

  it('perfil inexistente → no puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(true)
    expect(await canUseCoach(supabaseCon(null), 'u')).toBe(false)
  })
})
