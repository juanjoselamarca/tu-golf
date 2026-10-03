import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/golf/billing/server', () => ({ canAccessServer: vi.fn() }))
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/getPageUser', () => ({ getPageUser: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { canAccessServer } from '@/golf/billing/server'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { redirect } from 'next/navigation'
import { canUseCoach, checkCoachAccess } from './checkCoachAccess'

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

/**
 * /coach/progreso (y toda sub-ruta del coach) se autoriza SÓLO con este guard
 * server-side. Decisión cerrada con Juanjo (02-oct-2026): la beta con plan free
 * ve /coach/progreso completo. Sin beta (aunque tenga plan) va a /coach.
 */
describe('checkCoachAccess — guard de /coach/progreso', () => {
  beforeEach(() => {
    vi.mocked(canAccessServer).mockReset()
    vi.mocked(redirect).mockReset()
    vi.mocked(getPageUser).mockReset()
  })

  it('beta sí, plan free → entra a /coach/progreso (no redirige)', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    vi.mocked(createClient).mockResolvedValue(supabaseCon(true) as never)
    vi.mocked(getPageUser).mockResolvedValue({ id: 'u' } as never)
    await checkCoachAccess()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('beta no, plan free → redirige a /coach', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    vi.mocked(createClient).mockResolvedValue(supabaseCon(false) as never)
    vi.mocked(getPageUser).mockResolvedValue({ id: 'u' } as never)
    await checkCoachAccess()
    expect(redirect).toHaveBeenCalledWith('/coach')
  })

  it('sin sesión → login con next=/coach', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseCon(true) as never)
    vi.mocked(getPageUser).mockResolvedValue(null as never)
    vi.mocked(redirect).mockImplementation(((url: string) => { throw new Error(`REDIRECT:${url}`) }) as never)
    await expect(checkCoachAccess()).rejects.toThrow('REDIRECT:/login?next=/coach')
  })
})
