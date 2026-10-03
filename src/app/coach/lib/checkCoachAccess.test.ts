import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

/**
 * Regla (Juanjo, 03-oct-2026): acceso al coach = beta (TAIGER25) O plan pago con
 * tier suficiente ('coach-plan' vía canAccessServer). Con el paywall apagado nadie
 * pagó: sólo la beta abre el coach.
 */
describe('canUseCoach — beta O plan pago', () => {
  beforeEach(() => {
    vi.mocked(canAccessServer).mockReset()
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('beta sí, plan free → puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    expect(await canUseCoach(supabaseCon(true), 'u')).toBe(true)
  })

  it('beta no, plan PRO → puede (consulta la feature canónica coach-plan)', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(true)
    expect(await canUseCoach(supabaseCon(false), 'u')).toBe(true)
    expect(canAccessServer).toHaveBeenCalledWith('coach-plan', expect.anything(), 'u')
  })

  it('beta no, plan free → no puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    expect(await canUseCoach(supabaseCon(false), 'u')).toBe(false)
  })

  it('perfil inexistente, sin plan → no puede', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    expect(await canUseCoach(supabaseCon(null), 'u')).toBe(false)
  })

  it('beta sí → no consulta el plan (una query menos)', async () => {
    await canUseCoach(supabaseCon(true), 'u')
    expect(canAccessServer).not.toHaveBeenCalled()
  })

  it('paywall apagado: sin beta no entra aunque canAccess deje pasar todo', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'false')
    vi.mocked(canAccessServer).mockResolvedValue(true)
    expect(await canUseCoach(supabaseCon(false), 'u')).toBe(false)
    expect(canAccessServer).not.toHaveBeenCalled()
  })

  it('paywall apagado: la beta sigue entrando', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'false')
    expect(await canUseCoach(supabaseCon(true), 'u')).toBe(true)
  })
})

/**
 * /coach/progreso (y toda sub-ruta del coach) se autoriza SÓLO con este guard
 * server-side. Juanjo: la beta con plan free ve /coach/progreso completo (02-oct)
 * y el plan PRO también da acceso sin beta (03-oct). Sin beta ni plan → /coach.
 */
describe('checkCoachAccess — guard de /coach/progreso', () => {
  beforeEach(() => {
    vi.mocked(canAccessServer).mockReset()
    vi.mocked(redirect).mockReset()
    vi.mocked(getPageUser).mockReset()
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('beta sí, plan free → entra a /coach/progreso (no redirige)', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(false)
    vi.mocked(createClient).mockResolvedValue(supabaseCon(true) as never)
    vi.mocked(getPageUser).mockResolvedValue({ id: 'u' } as never)
    await checkCoachAccess()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('beta no, plan PRO → entra a /coach/progreso (no redirige)', async () => {
    vi.mocked(canAccessServer).mockResolvedValue(true)
    vi.mocked(createClient).mockResolvedValue(supabaseCon(false) as never)
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
