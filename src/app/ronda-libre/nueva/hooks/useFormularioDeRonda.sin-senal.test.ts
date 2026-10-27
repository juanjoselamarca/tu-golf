// @vitest-environment jsdom
// Un Pro sin señal arma una ronda Match Play Neto: el plan no se puede leer.
// Cadena real: useFormularioDeRonda → useAccesoNeto → useEntitlement → getSubscription.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const lecturas = vi.hoisted(() => ({ n: 0 }))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-pro' } } }) } }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/data/billing/subscription', async () => {
  const real = await vi.importActual<typeof import('@/lib/data/billing/subscription')>('@/lib/data/billing/subscription')
  return {
    SubscriptionReadError: real.SubscriptionReadError,
    getSubscription: async () => {
      lecturas.n++
      throw new real.SubscriptionReadError('fetch failed')
    },
  }
})

import { useFormularioDeRonda } from './useFormularioDeRonda'

beforeEach(() => {
  lecturas.n = 0
  vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('useFormularioDeRonda — plan ilegible (sin señal)', () => {
  it('Match Play Neto se mantiene y sin candado: decide el servidor', async () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.setModo('neto'))
    await waitFor(() => expect(lecturas.n).toBeGreaterThan(0))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.netoBloqueado).toBe(false)
    expect(result.current.modo).toBe('neto')
  })
})
