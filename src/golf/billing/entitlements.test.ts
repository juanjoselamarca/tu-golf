import { describe, it, expect } from 'vitest'
import { canAccess } from './entitlements'

describe('canAccess (flag ON)', () => {
  const ON = true

  it('free no accede a features Pro', () => {
    expect(canAccess('free', 'coach-plan', ON)).toBe(false)
    expect(canAccess('free', 'gwi', ON)).toBe(false)
    expect(canAccess('free', 'foursome', ON)).toBe(false)
  })

  it('free no accede a features Pro+', () => {
    expect(canAccess('free', 'season-projection', ON)).toBe(false)
    expect(canAccess('free', 'comparisons', ON)).toBe(false)
  })

  it('pro accede a features Pro', () => {
    expect(canAccess('pro', 'coach-plan', ON)).toBe(true)
    expect(canAccess('pro', 'gwi', ON)).toBe(true)
    expect(canAccess('pro', 'tournament-tv', ON)).toBe(true)
  })

  it('pro NO accede a features Pro+', () => {
    expect(canAccess('pro', 'season-projection', ON)).toBe(false)
    expect(canAccess('pro', 'comparisons', ON)).toBe(false)
  })

  it('pro_plus accede a todo', () => {
    expect(canAccess('pro_plus', 'season-projection', ON)).toBe(true)
    expect(canAccess('pro_plus', 'comparisons', ON)).toBe(true)
    expect(canAccess('pro_plus', 'coach-plan', ON)).toBe(true)
    expect(canAccess('pro_plus', 'gwi', ON)).toBe(true)
  })
})

describe('canAccess (flag OFF = paywall apagado)', () => {
  const OFF = false

  it('con flag apagado, cualquier tier accede a todo', () => {
    expect(canAccess('free', 'season-projection', OFF)).toBe(true)
    expect(canAccess('free', 'coach-plan', OFF)).toBe(true)
    expect(canAccess('free', 'foursome', OFF)).toBe(true)
  })
})
