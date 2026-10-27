// @vitest-environment jsdom
// Un Pro sin señal abre el wizard con un borrador Match Play Neto: el plan no
// se puede leer. Antes getSubscription caía a free, el efecto de coerción
// escribía modo 'gross' y el autosave lo dejaba en tournament_drafts.
// Cadena real: ComoJueganSection → useAccesoNeto → useEntitlement → getSubscription.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { TournamentConfig } from '@/lib/draft/types'

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

import { ComoJueganSection } from './ComoJueganSection'

const cfg = { format: 'match_play', modo: 'neto', prizes: [] } as unknown as TournamentConfig

beforeEach(() => {
  lecturas.n = 0
  vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('ComoJueganSection — plan ilegible (sin señal)', () => {
  it('no corrige a gross ni pone candado: Neto queda elegido y decide el servidor', async () => {
    const applyChange = vi.fn()
    render(<ComoJueganSection config={cfg} applyChange={applyChange} />)
    await waitFor(() => expect(lecturas.n).toBeGreaterThan(0))
    // Deja asentar los efectos posteriores a la lectura fallida.
    await new Promise(r => setTimeout(r, 0))
    expect(applyChange).not.toHaveBeenCalled()
    const neto = screen.getByRole('button', { name: 'Neto' })
    expect(neto.getAttribute('aria-disabled')).toBeNull()
    expect(neto.getAttribute('aria-pressed')).toBe('true')
  })
})
