import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// Gate Pro del modo neto al publicar un torneo. Se mockea todo lo que no es el
// gate (validación, cancha, publicación) y la capa de datos de la suscripción:
// el gate corre la cadena real checkModoAccess → canAccess.

const OWNER = '11111111-1111-4111-8111-111111111111'

let tier: 'free' | 'pro' = 'free'
let config: { format: string; modo: string; rounds: unknown[] } = { format: 'match_play', modo: 'neto', rounds: [] }
const lockAndPublish = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: () => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) b[m] = () => b
      b.single = async () => ({ data: { owner_id: OWNER, status: 'draft', config }, error: null })
      return b
    },
  }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/draft/upgrade-config', () => ({ upgradeConfig: (c: unknown) => c }))
vi.mock('@/lib/draft/schema', () => ({ tournamentConfigSchema: { safeParse: () => ({ success: true }) } }))
vi.mock('@/golf/tournament-config-validator', () => ({
  validateGolfRules: () => ({ errors: [], warnings: [], isReadyToCreate: true }),
}))
vi.mock('@/lib/data/course-aptitud', () => ({ canchasNoAptasParaTorneo: async () => [] }))
vi.mock('@/lib/data/tournaments/publishDraft', () => ({
  DRAFT_FOR_PUBLISH_SELECT: '*',
  creatingIsStale: () => false,
  findRecoverableTournament: async () => null,
  lockAndPublish: (...a: unknown[]) => lockAndPublish(...a),
}))
// `true` = la lectura del plan falla (red, timeout, RLS): getSubscription lanza.
let planIlegible = false
vi.mock('@/lib/data/billing/subscription', () => {
  class SubscriptionReadError extends Error {}
  return {
    SubscriptionReadError,
    getSubscription: async () => {
      if (planIlegible) throw new SubscriptionReadError('fetch failed')
      return { tier, status: 'active', trialRoundsRemaining: null, trialEndsAt: null, isFoundingMember: false, isAdmin: false }
    },
  }
})

import { POST } from './route'

const publicar = () =>
  POST({} as NextRequest, { params: Promise.resolve({ id: 'draft-1' }) })

beforeEach(() => {
  tier = 'free'
  planIlegible = false
  config = { format: 'match_play', modo: 'neto', rounds: [] }
  lockAndPublish.mockReset().mockResolvedValue({ kind: 'ok', tournamentId: 't-1', slug: 'torneo-1' })
  vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('POST create-tournament — gate Pro del modo neto', () => {
  it('free + match play neto → 403 pro_required con mensaje humano, sin publicar', async () => {
    const res = await publicar()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'pro_required', feature: 'match-play-neto', requiredTier: 'pro' })
    expect(body.message).toMatch(/plan Pro/)
    expect(lockAndPublish).not.toHaveBeenCalled()
  })

  it('no se pudo leer el plan + match play neto → 503 reintentable, sin publicar', async () => {
    planIlegible = true
    const res = await publicar()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'plan_unavailable', message: 'No pudimos verificar tu plan. Intenta de nuevo en unos segundos.' })
    expect(lockAndPublish).not.toHaveBeenCalled()
  })

  it('no se pudo leer el plan + match play gross → publica (gross no consulta el plan)', async () => {
    planIlegible = true
    config.modo = 'gross'
    expect((await publicar()).status).toBe(200)
  })

  it('free + match play gross → publica (match play gross es libre)', async () => {
    config.modo = 'gross'
    const res = await publicar()
    expect(res.status).toBe(200)
    expect(lockAndPublish).toHaveBeenCalledOnce()
  })

  it('free + stableford neto → 403', async () => {
    config.format = 'stableford'
    expect((await publicar()).status).toBe(403)
  })

  it('free + stroke play neto → publica (stroke play neto no está gateado)', async () => {
    config.format = 'stroke_play'
    expect((await publicar()).status).toBe(200)
  })

  it('Pro + match play neto → publica', async () => {
    tier = 'pro'
    expect((await publicar()).status).toBe(200)
  })

  it('paywall apagado → free publica match play neto', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'false')
    expect((await publicar()).status).toBe(200)
  })
})
