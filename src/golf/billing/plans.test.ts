import { describe, it, expect } from 'vitest'
import { TIERS, TIER_RANK, FEATURE_MIN_TIER, type Feature, type Tier } from './plans'

describe('catálogo de planes', () => {
  it('define los 3 tiers en orden ascendente de rango', () => {
    expect(TIERS).toEqual(['free', 'pro', 'pro_plus'])
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.pro)
    expect(TIER_RANK.pro).toBeLessThan(TIER_RANK.pro_plus)
  })

  it('cada feature mapea a un tier mínimo válido', () => {
    const tiers: Tier[] = ['free', 'pro', 'pro_plus']
    for (const f of Object.keys(FEATURE_MIN_TIER) as Feature[]) {
      expect(tiers).toContain(FEATURE_MIN_TIER[f])
    }
  })

  it('features Pro están correctamente asignados', () => {
    expect(FEATURE_MIN_TIER['coach-plan']).toBe('pro')
    expect(FEATURE_MIN_TIER['gwi']).toBe('pro')
    expect(FEATURE_MIN_TIER['match-play-neto']).toBe('pro')
    expect(FEATURE_MIN_TIER['tournament-tv']).toBe('pro')
  })

  it('features Pro+ están correctamente asignados', () => {
    expect(FEATURE_MIN_TIER['season-projection']).toBe('pro_plus')
    expect(FEATURE_MIN_TIER['comparisons']).toBe('pro_plus')
    expect(FEATURE_MIN_TIER['handicap-trend']).toBe('pro_plus')
  })

  it('tiene exactamente 24 features', () => {
    expect(Object.keys(FEATURE_MIN_TIER)).toHaveLength(24)
  })
})
