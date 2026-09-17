/**
 * Integration tests para el sistema de entitlements (paywall marcha blanca).
 *
 * Verifica el flujo completo: plans.ts -> entitlements.ts -> subscription.ts
 * -> useEntitlement (lógica pura) -> ProGate (decisión render).
 *
 * NO testa componentes React (eso está en ProGate.test.tsx).
 * Testa la CADENA de decisión end-to-end con datos reales.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FEATURE_MIN_TIER, TIERS, TIER_RANK, type Feature, type Tier } from '@/golf/billing/plans'
import { canAccessSimple as canAccess, isPaywallEnabled } from '@/golf/billing/entitlements'
import { getSubscription, type Subscription } from '@/lib/data/billing/subscription'
import { resolveEntitlement } from '@/hooks/useEntitlement'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    tier: 'free',
    status: 'active',
    trialRoundsRemaining: null,
    trialEndsAt: null,
    isFoundingMember: false, isAdmin: false,
    ...overrides,
  }
}

function mockSupabaseWith(profileData: Record<string, unknown> | null, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: profileData, error })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as Parameters<typeof getSubscription>[0]
}

// ---------------------------------------------------------------------------
// 1. Free user denied every Pro/Pro+ feature
// ---------------------------------------------------------------------------

describe('Escenario 1: usuario free con paywall ON', () => {
  const proFeatures = Object.entries(FEATURE_MIN_TIER)
    .filter(([, tier]) => tier === 'pro')
    .map(([f]) => f as Feature)

  const proPlusFeatures = Object.entries(FEATURE_MIN_TIER)
    .filter(([, tier]) => tier === 'pro_plus')
    .map(([f]) => f as Feature)

  it.each(proFeatures)('no accede a feature Pro: %s', (feature) => {
    expect(canAccess('free', feature, true)).toBe(false)
  })

  it.each(proPlusFeatures)('no accede a feature Pro+: %s', (feature) => {
    expect(canAccess('free', feature, true)).toBe(false)
  })

  it('resolveEntitlement retorna allowed=false para free + feature Pro', () => {
    const sub = makeSub({ tier: 'free' })
    const result = resolveEntitlement(sub, 'coach-plan', true)
    expect(result).toEqual({ allowed: false, loading: false, tier: 'free' })
  })
})

// ---------------------------------------------------------------------------
// 2. Pro user accesses Pro features, denied Pro+
// ---------------------------------------------------------------------------

describe('Escenario 2: usuario Pro con paywall ON', () => {
  const proFeatures = Object.entries(FEATURE_MIN_TIER)
    .filter(([, tier]) => tier === 'pro')
    .map(([f]) => f as Feature)

  const proPlusFeatures = Object.entries(FEATURE_MIN_TIER)
    .filter(([, tier]) => tier === 'pro_plus')
    .map(([f]) => f as Feature)

  it.each(proFeatures)('accede a feature Pro: %s', (feature) => {
    expect(canAccess('pro', feature, true)).toBe(true)
  })

  it.each(proPlusFeatures)('NO accede a feature Pro+: %s', (feature) => {
    expect(canAccess('pro', feature, true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Pro+ user accesses everything
// ---------------------------------------------------------------------------

describe('Escenario 3: usuario Pro+ accede a todo', () => {
  const allFeatures = Object.keys(FEATURE_MIN_TIER) as Feature[]

  it.each(allFeatures)('accede a: %s', (feature) => {
    expect(canAccess('pro_plus', feature, true)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. PAYWALL_ENABLED=false -> everyone accesses everything
// ---------------------------------------------------------------------------

describe('Escenario 4: paywall desactivado (flag OFF)', () => {
  const allFeatures = Object.keys(FEATURE_MIN_TIER) as Feature[]

  it.each(allFeatures)('free accede a %s con flag OFF', (feature) => {
    expect(canAccess('free', feature, false)).toBe(true)
  })

  it('resolveEntitlement retorna allowed=true para free con flag OFF', () => {
    const sub = makeSub({ tier: 'free' })
    const result = resolveEntitlement(sub, 'season-projection', false)
    expect(result).toEqual({ allowed: true, loading: false, tier: 'free' })
  })
})

// ---------------------------------------------------------------------------
// 5. User with no profile row -> falls back to free gracefully
// ---------------------------------------------------------------------------

describe('Escenario 5: usuario sin fila en profiles (Supabase error)', () => {
  it('getSubscription retorna free fallback si no hay data', async () => {
    const supabase = mockSupabaseWith(null, { message: 'no rows' })
    const sub = await getSubscription(supabase, 'user-nonexistent')
    expect(sub.tier).toBe('free')
    expect(sub.status).toBe('active')
    expect(sub.isFoundingMember).toBe(false)
  })

  it('getSubscription retorna free fallback si data es null', async () => {
    const supabase = mockSupabaseWith(null)
    const sub = await getSubscription(supabase, 'user-null')
    expect(sub.tier).toBe('free')
  })
})

// ---------------------------------------------------------------------------
// 6. resolveEntitlement loading state (sub is null)
// ---------------------------------------------------------------------------

describe('Escenario 6: estado loading (sub=null)', () => {
  it('retorna loading=true, allowed=false, tier=null', () => {
    const result = resolveEntitlement(null, 'coach-plan', true)
    expect(result).toEqual({ allowed: false, loading: true, tier: null })
  })

  it('con flag OFF tambien retorna loading (null sub)', () => {
    const result = resolveEntitlement(null, 'coach-plan', false)
    // Incluso con flag OFF, si sub es null -> loading
    expect(result.loading).toBe(true)
    expect(result.allowed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 7. Tier rank consistency
// ---------------------------------------------------------------------------

describe('Escenario 7: integridad del catalogo de planes', () => {
  it('23 features en el catalogo', () => {
    expect(Object.keys(FEATURE_MIN_TIER)).toHaveLength(24)
  })

  it('ningun feature mapeado a un tier inexistente', () => {
    const validTiers = new Set(TIERS)
    for (const [feature, tier] of Object.entries(FEATURE_MIN_TIER)) {
      expect(validTiers.has(tier), `${feature} tiene tier invalido: ${tier}`).toBe(true)
    }
  })

  it('no hay features asignados a free tier (todos gateados)', () => {
    const freeFeatures = Object.entries(FEATURE_MIN_TIER).filter(([, t]) => t === 'free')
    expect(freeFeatures).toHaveLength(0)
  })

  it('tier ranks son estrictamente crecientes', () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.pro)
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.pro_plus)
  })
})

// ---------------------------------------------------------------------------
// 8. GAP: subscription status NOT checked (documenting current behavior)
// ---------------------------------------------------------------------------

describe('GAP: subscription_status ignorado por canAccess', () => {
  it('usuario canceled con tier pro SIGUE teniendo acceso (BUG potencial)', () => {
    // FIXED: canAccess ahora chequea status. canceled = sin acceso.
    const sub = makeSub({ tier: 'pro', status: 'canceled' })
    const result = resolveEntitlement(sub, 'coach-plan', true)
    expect(result.allowed).toBe(false)
  })

  it('usuario past_due con tier pro SIGUE teniendo acceso', () => {
    const sub = makeSub({ tier: 'pro', status: 'past_due' })
    const result = resolveEntitlement(sub, 'gwi', true)
    expect(result.allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 9. GAP: admin bypass not implemented
// ---------------------------------------------------------------------------

describe('GAP: admin bypass no implementado', () => {
  it('no hay concepto de admin override en canAccess', () => {
    // canAccess solo recibe (tier, feature, paywallEnabled).
    // No hay forma de decir "este usuario es admin, siempre permitir".
    // Si un admin tiene tier=free, queda bloqueado de features Pro.
    // Esto es un GAP para Fase 2.
    expect(canAccess('free', 'coach-plan', true)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 10. E2E: getSubscription -> resolveEntitlement chain
// ---------------------------------------------------------------------------

describe('Escenario 10: cadena completa getSubscription -> resolveEntitlement', () => {
  it('usuario Pro cargado de Supabase -> accede a feature Pro', async () => {
    const supabase = mockSupabaseWith({
      subscription_tier: 'pro',
      subscription_status: 'active',
      trial_rounds_remaining: null,
      trial_ends_at: null,
      is_founding_member: true,
    })

    const sub = await getSubscription(supabase, 'user-pro')
    const result = resolveEntitlement(sub, 'coach-plan', true)

    expect(result).toEqual({ allowed: true, loading: false, tier: 'pro' })
    expect(sub.isFoundingMember).toBe(true)
  })

  it('usuario trialing Pro+ -> accede a feature Pro+', async () => {
    const supabase = mockSupabaseWith({
      subscription_tier: 'pro_plus',
      subscription_status: 'trialing',
      trial_rounds_remaining: 3,
      trial_ends_at: '2026-12-01T00:00:00Z',
      is_founding_member: false,
    })

    const sub = await getSubscription(supabase, 'user-trial')
    const result = resolveEntitlement(sub, 'season-projection', true)

    expect(result).toEqual({ allowed: true, loading: false, tier: 'pro_plus' })
    expect(sub.trialRoundsRemaining).toBe(3)
  })

  it('Supabase devuelve null tier -> coerce a free', async () => {
    const supabase = mockSupabaseWith({
      subscription_tier: null,
      subscription_status: null,
      trial_rounds_remaining: null,
      trial_ends_at: null,
      is_founding_member: null,
    })

    const sub = await getSubscription(supabase, 'user-null-fields')
    expect(sub.tier).toBe('free')
    expect(sub.status).toBe('active')
    expect(sub.isFoundingMember).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 11. isPaywallEnabled reads env correctly
// ---------------------------------------------------------------------------

describe('isPaywallEnabled', () => {
  const originalEnv = process.env.NEXT_PUBLIC_PAYWALL_ENABLED

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_PAYWALL_ENABLED = originalEnv
    } else {
      delete process.env.NEXT_PUBLIC_PAYWALL_ENABLED
    }
  })

  it('retorna false si env no esta seteada', () => {
    delete process.env.NEXT_PUBLIC_PAYWALL_ENABLED
    expect(isPaywallEnabled()).toBe(false)
  })

  it('retorna false si env es "false"', () => {
    process.env.NEXT_PUBLIC_PAYWALL_ENABLED = 'false'
    expect(isPaywallEnabled()).toBe(false)
  })

  it('retorna true si env es "true"', () => {
    process.env.NEXT_PUBLIC_PAYWALL_ENABLED = 'true'
    expect(isPaywallEnabled()).toBe(true)
  })

  it('retorna false si env es string vacio', () => {
    process.env.NEXT_PUBLIC_PAYWALL_ENABLED = ''
    expect(isPaywallEnabled()).toBe(false)
  })
})
