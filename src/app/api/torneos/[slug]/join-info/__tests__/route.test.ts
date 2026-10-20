// El visitante sin sesión se inscribe como invitado, y eso exige plan Pro del organizador
// ('guest-tournament'). Antes join-info no lo decía: el formulario se llenaba y moría en un
// 403 ("El organizador necesita plan Pro para invitados") que el jugador no puede resolver.
// Visto en prod el 20-oct-2026 con un torneo de un organizador free.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const checkFeatureAccess = vi.fn()
vi.mock('@/golf/billing/require-feature', () => ({ checkFeatureAccess: (...a: unknown[]) => checkFeatureAccess(...a) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
let user: { id: string } | null = null
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({}) }))
const TORNEO = { id: 't1', slug: 'copa', name: 'Copa', status: 'open', organizer_id: 'org-1' }
vi.mock('@/lib/data/tournaments/joinFlow', () => ({
  fetchJoinInfoPublica: async () => TORNEO,
  fetchJoinInfo: async () => ({ tournament: TORNEO, profile: { name: 'Ana', indice: 12 }, alreadyRegistered: false, capacity: null }),
}))

import { GET } from '../route'

const llamar = async () => {
  const res = await GET(new NextRequest('https://golfersplus.vercel.app/api/torneos/copa/join-info'), { params: Promise.resolve({ slug: 'copa' }) })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  user = null
  checkFeatureAccess.mockReset()
  captureError.mockReset()
})

describe('GET /api/torneos/[slug]/join-info · invitados según el plan del organizador', () => {
  it('organizador sin plan que admita invitados → invitadosCerrados: true', async () => {
    checkFeatureAccess.mockResolvedValue({ allowed: false, tier: 'free', requiredTier: 'pro' })
    const { status, body } = await llamar()
    expect(status).toBe(200)
    expect(body.invitadosCerrados).toBe(true)
    expect(checkFeatureAccess).toHaveBeenCalledWith(expect.anything(), 'org-1', 'guest-tournament')
  })

  it('organizador Pro (o paywall apagado) → invitadosCerrados: false', async () => {
    checkFeatureAccess.mockResolvedValue({ allowed: true, tier: 'pro', requiredTier: 'pro' })
    const { body } = await llamar()
    expect(body.invitadosCerrados).toBe(false)
  })

  it('plan no verificable → no se cierra: el formulario queda y guest-join responde 503 con reintento', async () => {
    checkFeatureAccess.mockResolvedValue({ allowed: false, tier: 'free', requiredTier: 'pro', planNoVerificado: true })
    const { body } = await llamar()
    expect(body.invitadosCerrados).toBe(false)
  })

  it('un error inesperado no tumba la ficha del torneo', async () => {
    checkFeatureAccess.mockRejectedValue(new Error('boom'))
    const { status, body } = await llamar()
    expect(status).toBe(200)
    expect(body.tournament.slug).toBe('copa')
    expect(body.invitadosCerrados).toBe(false)
    expect(captureError).toHaveBeenCalled()
  })

  it('con sesión no se consulta el plan (se inscribe con su cuenta)', async () => {
    user = { id: 'u1' }
    const { body } = await llamar()
    expect(body.authenticated).toBe(true)
    expect(body.invitadosCerrados).toBeUndefined()
    expect(checkFeatureAccess).not.toHaveBeenCalled()
  })
})
