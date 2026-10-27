// @vitest-environment jsdom
// Cadena real useAccesoNeto → useEntitlement → getSubscription, con Supabase
// mockeado. Lo que importa: un Pro sin señal no queda forzado a gross.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const plan = vi.hoisted(() => ({ falla: false, tier: 'free' as 'free' | 'pro' }))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/data/billing/subscription', async () => {
  const real = await vi.importActual<typeof import('@/lib/data/billing/subscription')>('@/lib/data/billing/subscription')
  return {
    SubscriptionReadError: real.SubscriptionReadError,
    getSubscription: async () => {
      if (plan.falla) throw new real.SubscriptionReadError('fetch failed')
      return { tier: plan.tier, status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false, isAdmin: false }
    },
  }
})

import { useAccesoNeto } from './useAccesoNeto'
import { useEntitlement } from './useEntitlement'

beforeEach(() => {
  plan.falla = false
  plan.tier = 'free'
  vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('useAccesoNeto', () => {
  it('free leído: neto bloqueado', async () => {
    const { result } = renderHook(() => useAccesoNeto())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.puedeUsar('match-play-neto')).toBe(false)
  })

  it('Pro leído: neto permitido', async () => {
    plan.tier = 'pro'
    const { result } = renderHook(() => useAccesoNeto())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.puedeUsar('match-play-neto')).toBe(true)
  })

  it('plan ilegible (sin señal): no bloquea, decide el servidor', async () => {
    plan.falla = true
    const { result } = renderHook(() => useAccesoNeto())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.puedeUsar('match-play-neto')).toBe(true)
    expect(result.current.puedeUsar('stableford-neto')).toBe(true)
  })
})

describe('useEntitlement con plan ilegible', () => {
  it('los gates de contenido premium siguen cerrados (fail-closed), marcados como plan desconocido', async () => {
    plan.falla = true
    const { result } = renderHook(() => useEntitlement('coach-plan'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ allowed: false, planDesconocido: true })
  })

  it('paywall apagado: con plan ilegible todo queda permitido (sin upsell en plena ronda)', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'false')
    plan.falla = true
    const { result } = renderHook(() => useEntitlement('gwi'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ allowed: true, planDesconocido: true })
    const neto = renderHook(() => useAccesoNeto())
    await waitFor(() => expect(neto.result.current.loading).toBe(false))
    expect(neto.result.current.puedeUsar('match-play-neto')).toBe(true)
  })

  it('paywall prendido: con plan ilegible el contenido premium sigue cerrado', async () => {
    plan.falla = true
    const { result } = renderHook(() => useEntitlement('gwi'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ allowed: false, planDesconocido: true })
  })
})
