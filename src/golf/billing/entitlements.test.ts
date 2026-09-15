import { describe, it, expect } from 'vitest'
import { canAccess, canAccessSimple, type AccessContext } from './entitlements'

const active = (tier: AccessContext['tier'], isAdmin = false): AccessContext =>
  ({ tier, status: 'active', isAdmin })

describe('canAccess (flag ON)', () => {
  const ON = true

  it('free no accede a features Pro', () => {
    expect(canAccess(active('free'), 'coach-plan', ON)).toBe(false)
    expect(canAccess(active('free'), 'gwi', ON)).toBe(false)
    expect(canAccess(active('free'), 'foursome', ON)).toBe(false)
  })

  it('free no accede a features Pro+', () => {
    expect(canAccess(active('free'), 'season-projection', ON)).toBe(false)
  })

  it('pro accede a features Pro', () => {
    expect(canAccess(active('pro'), 'coach-plan', ON)).toBe(true)
    expect(canAccess(active('pro'), 'gwi', ON)).toBe(true)
    expect(canAccess(active('pro'), 'tournament-tv', ON)).toBe(true)
  })

  it('pro NO accede a features Pro+', () => {
    expect(canAccess(active('pro'), 'season-projection', ON)).toBe(false)
  })

  it('pro_plus accede a todo', () => {
    expect(canAccess(active('pro_plus'), 'season-projection', ON)).toBe(true)
    expect(canAccess(active('pro_plus'), 'coach-plan', ON)).toBe(true)
  })
})

describe('canAccess — subscription status', () => {
  const ON = true

  it('canceled NO accede aunque tenga tier pro', () => {
    expect(canAccess({ tier: 'pro', status: 'canceled', isAdmin: false }, 'coach-plan', ON)).toBe(false)
  })

  it('paused NO accede aunque tenga tier pro', () => {
    expect(canAccess({ tier: 'pro', status: 'paused', isAdmin: false }, 'coach-plan', ON)).toBe(false)
  })

  it('trialing SÍ accede con tier pro_plus', () => {
    expect(canAccess({ tier: 'pro_plus', status: 'trialing', isAdmin: false }, 'season-projection', ON)).toBe(true)
  })

  it('past_due tiene gracia — SÍ accede', () => {
    expect(canAccess({ tier: 'pro', status: 'past_due', isAdmin: false }, 'coach-plan', ON)).toBe(true)
  })
})

describe('canAccess — admin bypass', () => {
  const ON = true

  it('admin free accede a todo', () => {
    expect(canAccess({ tier: 'free', status: 'active', isAdmin: true }, 'season-projection', ON)).toBe(true)
    expect(canAccess({ tier: 'free', status: 'active', isAdmin: true }, 'coach-plan', ON)).toBe(true)
  })

  it('admin canceled accede a todo', () => {
    expect(canAccess({ tier: 'free', status: 'canceled', isAdmin: true }, 'coach-plan', ON)).toBe(true)
  })
})

describe('canAccess (flag OFF)', () => {
  it('con flag apagado, cualquier tier accede a todo', () => {
    expect(canAccess(active('free'), 'season-projection', false)).toBe(true)
    expect(canAccess(active('free'), 'coach-plan', false)).toBe(true)
  })
})

describe('canAccessSimple (backwards compat)', () => {
  it('funciona como canAccess con status=active, isAdmin=false', () => {
    expect(canAccessSimple('pro', 'coach-plan', true)).toBe(true)
    expect(canAccessSimple('free', 'coach-plan', true)).toBe(false)
    expect(canAccessSimple('free', 'coach-plan', false)).toBe(true)
  })
})
