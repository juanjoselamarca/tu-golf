/**
 * /en-vivo en el cliente — qué ve cada plan (decisión 24-nov-2026).
 *
 * - El en vivo lo ve cualquier cuenta: un usuario gratis ve el leaderboard, nunca
 *   un upsell (si LiveView vuelve a envolverse en un gate de plan, esto falla).
 * - El Modo TV sigue PRO ('tournament-tv'): sin acceso, el botón no aparece y no
 *   hay forma de entrar; con acceso, entra.
 * - Compartir invita a la página pública del torneo (no pide cuenta), con la misma
 *   fuente que el resto de la app (`enlacesDeTorneo`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Feature } from '@/golf/billing/plans'
import type { SharePayload } from '@/golf/share/types'

const plan = vi.hoisted(() => ({ pro: false, loading: false }))
const compartido = vi.hoisted(() => ({ payloads: [] as unknown[] }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/torneo/copa/en-vivo' }))
// Usuario gratis = ninguna feature PRO. Lo usan LiveView y cualquier ProGate que se le ponga encima.
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: vi.fn((_feature: Feature) => ({
    allowed: plan.pro && !plan.loading, loading: plan.loading, tier: plan.loading ? null : plan.pro ? 'pro' : 'free', signedIn: true,
  })),
}))
vi.mock('@/components/share/useShare', () => ({
  useShare: () => ({
    isSharing: false,
    share: vi.fn(async (p: SharePayload) => { compartido.payloads.push(p); return { ok: true, method: 'native' } }),
  }),
}))

import LiveView, { type LiveViewProps } from './LiveView'
import { useEntitlement } from '@/hooks/useEntitlement'
import { enlacesDeTorneo } from '@/components/ronda/OpcionesParaCompartir'

const tournament = {
  id: 't1', slug: 'copa', name: 'Copa', format: 'stroke_play', formato_juego: 'stroke_play', modo_juego: 'gross',
  hole_count: 9, total_rounds: 1, status: 'in_progress', live: false, caminoRondaLibre: true,
} as unknown as LiveViewProps['tournament']

function pintar() {
  render(
    <LiveView
      tournament={tournament}
      players={[]}
      categories={[]}
      groups={[]}
      fuera={[{ id: 'j-ana', name: 'Ana', status: 'withdrawn', reason: 'Lesión', group_id: null }]}
    />,
  )
}

beforeEach(() => {
  document.body.innerHTML = ''
  plan.pro = false
  plan.loading = false
  compartido.payloads = []
  vi.mocked(useEntitlement).mockClear()
})

describe('/en-vivo — usuario gratis', () => {
  it('ve el leaderboard, no un upsell', () => {
    pintar()
    expect(screen.getByRole('region', { name: 'No compiten por posición' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compartir leaderboard' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Ver planes|Probar 14 días/)
  })

  it('no ve el botón del Modo TV (sigue PRO) y no hay cómo entrar', () => {
    pintar()
    expect(screen.queryByRole('button', { name: /TV mode/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salir del modo TV' })).toBeNull()
    expect(vi.mocked(useEntitlement).mock.calls.some(([f]) => f === 'tournament-tv')).toBe(true)
  })

  it('mientras se lee el plan, tampoco aparece el botón', () => {
    plan.pro = true
    plan.loading = true
    pintar()
    expect(screen.queryByRole('button', { name: /TV mode/i })).toBeNull()
  })
})

describe('/en-vivo — usuario PRO', () => {
  it('ve el botón del Modo TV y entra', () => {
    plan.pro = true
    pintar()
    fireEvent.click(screen.getByRole('button', { name: /TV mode/i }))
    expect(screen.getByRole('button', { name: 'Salir del modo TV' })).toBeTruthy()
  })
})

describe('/en-vivo — compartir', () => {
  it('invita a la página pública del torneo (la misma fuente que el resto de la app), no a /en-vivo', async () => {
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Compartir leaderboard' }))
    await waitFor(() => expect(compartido.payloads).toHaveLength(1))
    expect(compartido.payloads[0]).toEqual(enlacesDeTorneo('copa', 'Copa').seguir)
    expect(JSON.stringify(compartido.payloads[0])).not.toContain('/en-vivo')
  })
})
