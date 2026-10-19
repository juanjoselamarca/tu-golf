import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { KNOWN_FORMAT_KEYS } from '@/golf/formats'
import {
  featureDelModo,
  modoPermitidoPorPlan,
  netoBloqueadoPorPlan,
  MENSAJE_NETO_PRO,
  MENSAJE_PLAN_NO_VERIFICADO,
} from './modo-por-plan'
import { NETO_FEATURE_BY_FORMAT } from './plans'

const getSubscription = vi.fn()
vi.mock('@/lib/data/billing/subscription', async () => {
  const real = await vi.importActual<typeof import('@/lib/data/billing/subscription')>('@/lib/data/billing/subscription')
  return { SubscriptionReadError: real.SubscriptionReadError, getSubscription: (...a: unknown[]) => getSubscription(...a) }
})
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))

import { checkFeatureAccess, checkModoAccess } from './require-feature'
import { SubscriptionReadError } from '@/lib/data/billing/subscription'

const nadie = () => false
const todos = () => true

describe('featureDelModo', () => {
  it('gross nunca pide plan, en ningún formato', () => {
    for (const f of KNOWN_FORMAT_KEYS) expect(featureDelModo(f, 'gross')).toBeNull()
  })

  it('neto pide la feature de su formato sólo en match play, best ball y stableford', () => {
    expect(featureDelModo('match_play', 'neto')).toBe('match-play-neto')
    expect(featureDelModo('best_ball', 'neto')).toBe('best-ball-neto')
    expect(featureDelModo('stableford', 'neto')).toBe('stableford-neto')
    expect(featureDelModo('stroke_play', 'neto')).toBeNull()
    expect(featureDelModo('scramble', 'neto')).toBeNull()
    expect(featureDelModo('foursome', 'neto')).toBeNull()
  })

  it('una clave del prototipo no se confunde con un formato gateado', () => {
    expect(featureDelModo('toString', 'neto')).toBeNull()
    expect(featureDelModo('constructor', 'neto')).toBeNull()
  })

  it('cubre exactamente los formatos de NETO_FEATURE_BY_FORMAT (una fuente)', () => {
    const gateados = KNOWN_FORMAT_KEYS.filter(f => featureDelModo(f, 'neto') !== null)
    expect([...gateados].sort()).toEqual(Object.keys(NETO_FEATURE_BY_FORMAT).sort())
  })
})

describe('modoPermitidoPorPlan', () => {
  it('sin plan, el neto gateado cae a gross (nunca queda un valor bloqueado)', () => {
    expect(modoPermitidoPorPlan('match_play', 'neto', nadie)).toBe('gross')
    expect(modoPermitidoPorPlan('best_ball', 'neto', nadie)).toBe('gross')
    expect(modoPermitidoPorPlan('stableford', 'neto', nadie)).toBe('gross')
  })

  it('match play gross es libre: sin plan sigue en gross', () => {
    expect(modoPermitidoPorPlan('match_play', 'gross', nadie)).toBe('gross')
  })

  it('stroke play neto es libre para todos', () => {
    expect(modoPermitidoPorPlan('stroke_play', 'neto', nadie)).toBe('neto')
  })

  it('con plan, el neto se respeta', () => {
    expect(modoPermitidoPorPlan('match_play', 'neto', todos)).toBe('neto')
  })

  it('consulta la feature del formato, no otra', () => {
    const soloStableford = (f: string) => f === 'stableford-neto'
    expect(modoPermitidoPorPlan('stableford', 'neto', soloStableford)).toBe('neto')
    expect(modoPermitidoPorPlan('match_play', 'neto', soloStableford)).toBe('gross')
  })
})

describe('netoBloqueadoPorPlan', () => {
  it('bloquea el neto de match play sin plan y nunca el de stroke play', () => {
    expect(netoBloqueadoPorPlan('match_play', nadie)).toBe(true)
    expect(netoBloqueadoPorPlan('stroke_play', nadie)).toBe(false)
    expect(netoBloqueadoPorPlan('match_play', todos)).toBe(false)
  })
})

describe('checkModoAccess (gate de servidor)', () => {
  const supabase = {} as SupabaseClient
  const sub = (tier: 'free' | 'pro', extra: Record<string, unknown> = {}) => ({
    tier, status: 'active', trialRoundsRemaining: null, trialEndsAt: null,
    isFoundingMember: false, isAdmin: false, ...extra,
  })

  beforeEach(() => {
    getSubscription.mockReset()
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'true')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('free + match play neto → pro_required con mensaje humano', async () => {
    getSubscription.mockResolvedValue(sub('free'))
    expect(await checkModoAccess(supabase, 'u1', 'match_play', 'neto')).toEqual({
      status: 403,
      body: { error: 'pro_required', feature: 'match-play-neto', requiredTier: 'pro', message: MENSAJE_NETO_PRO },
    })
  })

  it('plan ilegible (red/RLS) + neto → 503 plan_unavailable, nunca pro_required', async () => {
    getSubscription.mockRejectedValue(new SubscriptionReadError('fetch failed'))
    expect(await checkModoAccess(supabase, 'u1', 'match_play', 'neto')).toEqual({
      status: 503,
      body: { error: 'plan_unavailable', message: MENSAJE_PLAN_NO_VERIFICADO },
    })
  })

  it('plan ilegible: los demás gates siguen fail-closed (checkFeatureAccess → allowed false)', async () => {
    getSubscription.mockRejectedValue(new SubscriptionReadError('fetch failed'))
    expect(await checkFeatureAccess(supabase, 'u1', 'coach-plan')).toMatchObject({ allowed: false, planNoVerificado: true })
  })

  it('un error que no es de lectura del plan no se traga', async () => {
    getSubscription.mockRejectedValue(new TypeError('bug'))
    await expect(checkFeatureAccess(supabase, 'u1', 'coach-plan')).rejects.toBeInstanceOf(TypeError)
  })

  it('free + match play gross → pasa sin leer la suscripción', async () => {
    expect(await checkModoAccess(supabase, 'u1', 'match_play', 'gross')).toBeNull()
    expect(getSubscription).not.toHaveBeenCalled()
  })

  it('Pro + match play neto → pasa', async () => {
    getSubscription.mockResolvedValue(sub('pro'))
    expect(await checkModoAccess(supabase, 'u1', 'match_play', 'neto')).toBeNull()
  })

  it('Pro cancelado → bloqueado', async () => {
    getSubscription.mockResolvedValue(sub('pro', { status: 'canceled' }))
    expect(await checkModoAccess(supabase, 'u1', 'best_ball', 'neto')).not.toBeNull()
  })

  it('paywall apagado → todo pasa', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYWALL_ENABLED', 'false')
    getSubscription.mockResolvedValue(sub('free'))
    expect(await checkModoAccess(supabase, 'u1', 'stableford', 'neto')).toBeNull()
  })
})
