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

describe('canUseCoach — la beta da acceso al coach (marcha blanca, 01-oct-2026)', () => {
  beforeEach(() => vi.mocked(canAccessServer).mockReset())

  it('beta sí, plan free → puede (el único usuario real del coach hoy)', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    expect(await canUseCoach(supabaseCon(true), 'u')).toBe(true)
  })

  it('beta no, plan pro → no puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(true)
    expect(await canUseCoach(supabaseCon(false), 'u')).toBe(false)
  })

  it('perfil inexistente → no puede', async () => {
    expect(await canUseCoach(supabaseCon(null), 'u')).toBe(false)
  })
})
