import { describe, it, expect } from 'vitest'
import {
  getScoreResult,
  normalizeGarminColor,
  colorToDiff,
  isAmbiguousColor,
  GARMIN_COLOR_TO_DIFF,
} from '../golf/core/colors'

describe('getScoreResult', () => {
  it('eagle or better (diff <= -2)', () => {
    expect(getScoreResult(2, 4)).toBe('eagle_or_better') // Eagle
    expect(getScoreResult(1, 4)).toBe('eagle_or_better') // Ace on par 4
    expect(getScoreResult(2, 5)).toBe('eagle_or_better') // Albatross
  })

  it('birdie (diff === -1)', () => {
    expect(getScoreResult(3, 4)).toBe('birdie')
    expect(getScoreResult(2, 3)).toBe('birdie')
    expect(getScoreResult(4, 5)).toBe('birdie')
  })

  it('par (diff === 0)', () => {
    expect(getScoreResult(3, 3)).toBe('par')
    expect(getScoreResult(4, 4)).toBe('par')
    expect(getScoreResult(5, 5)).toBe('par')
  })

  it('bogey (diff === +1)', () => {
    expect(getScoreResult(5, 4)).toBe('bogey')
    expect(getScoreResult(4, 3)).toBe('bogey')
    expect(getScoreResult(6, 5)).toBe('bogey')
  })

  it('double or worse (diff >= +2)', () => {
    expect(getScoreResult(6, 4)).toBe('double_or_worse')
    expect(getScoreResult(7, 4)).toBe('double_or_worse')
    expect(getScoreResult(10, 4)).toBe('double_or_worse')
  })

  it('no_score for null/undefined/zero', () => {
    expect(getScoreResult(null, 4)).toBe('no_score')
    expect(getScoreResult(undefined, 4)).toBe('no_score')
    expect(getScoreResult(4, null)).toBe('no_score')
    expect(getScoreResult(0, 4)).toBe('no_score')
  })
})

describe('normalizeGarminColor', () => {
  it('dark blue variants', () => {
    expect(normalizeGarminColor('dark_blue')).toBe('dark_blue')
    expect(normalizeGarminColor('darkblue')).toBe('dark_blue')
    expect(normalizeGarminColor('DarkBlue')).toBe('dark_blue')
    expect(normalizeGarminColor('navy')).toBe('dark_blue')
    expect(normalizeGarminColor('NAVY')).toBe('dark_blue')
  })

  it('light blue / celeste variants', () => {
    expect(normalizeGarminColor('light_blue')).toBe('light_blue')
    expect(normalizeGarminColor('lightblue')).toBe('light_blue')
    expect(normalizeGarminColor('celeste')).toBe('light_blue')
    expect(normalizeGarminColor('cyan')).toBe('light_blue')
    expect(normalizeGarminColor('blue')).toBe('light_blue')
  })

  it('green variants', () => {
    expect(normalizeGarminColor('green')).toBe('green')
    expect(normalizeGarminColor('lime')).toBe('green')
    expect(normalizeGarminColor('GREEN')).toBe('green')
  })

  it('gold/orange variants', () => {
    expect(normalizeGarminColor('gold')).toBe('gold')
    expect(normalizeGarminColor('orange')).toBe('gold')
    expect(normalizeGarminColor('amber')).toBe('gold')
    expect(normalizeGarminColor('yellow')).toBe('gold')
  })

  it('red variants', () => {
    expect(normalizeGarminColor('red')).toBe('red')
    expect(normalizeGarminColor('crimson')).toBe('red')
    expect(normalizeGarminColor('darkred')).toBe('red')
  })

  it('unknown colors default to green (par)', () => {
    expect(normalizeGarminColor('purple')).toBe('green')
    expect(normalizeGarminColor('xyz')).toBe('green')
    expect(normalizeGarminColor('')).toBe('green')
  })

  it('strips hyphens and underscores before matching', () => {
    expect(normalizeGarminColor('dark-blue')).toBe('dark_blue')
    expect(normalizeGarminColor('light-blue')).toBe('light_blue')
  })

  it('trims whitespace', () => {
    expect(normalizeGarminColor('  red  ')).toBe('red')
    expect(normalizeGarminColor(' green ')).toBe('green')
  })
})

describe('colorToDiff', () => {
  it('dark_blue → eagle (-2)', () => {
    expect(colorToDiff('dark_blue')).toBe(-2)
    expect(colorToDiff('navy')).toBe(-2)
  })

  it('light_blue → birdie (-1)', () => {
    expect(colorToDiff('light_blue')).toBe(-1)
    expect(colorToDiff('celeste')).toBe(-1)
  })

  it('green → par (0)', () => {
    expect(colorToDiff('green')).toBe(0)
    expect(colorToDiff('lime')).toBe(0)
  })

  it('gold → bogey (+1)', () => {
    expect(colorToDiff('gold')).toBe(1)
    expect(colorToDiff('orange')).toBe(1)
    expect(colorToDiff('amber')).toBe(1)
  })

  it('red → double+ (+2)', () => {
    expect(colorToDiff('red')).toBe(2)
  })

  it('unknown color → par (0)', () => {
    expect(colorToDiff('purple')).toBe(0)
  })

  it('matches CLAUDE.md color spec', () => {
    // Verified against real Garmin Golf captures (24 Mar 2026)
    // See CLAUDE.md "COLORES GARMIN GOLF" section
    expect(colorToDiff('dark_blue')).toBeLessThanOrEqual(-2) // Eagle o mejor
    expect(colorToDiff('celeste')).toBe(-1)                   // Birdie
    expect(colorToDiff('green')).toBe(0)                      // Par
    expect(colorToDiff('gold')).toBe(1)                       // Bogey
    expect(colorToDiff('red')).toBe(2)                        // Doble bogey+
  })
})

describe('isAmbiguousColor', () => {
  it('red is ambiguous (could be double or worse)', () => {
    expect(isAmbiguousColor('red')).toBe(true)
    expect(isAmbiguousColor('crimson')).toBe(true)
  })

  it('other colors are not ambiguous', () => {
    expect(isAmbiguousColor('dark_blue')).toBe(false)
    expect(isAmbiguousColor('light_blue')).toBe(false)
    expect(isAmbiguousColor('green')).toBe(false)
    expect(isAmbiguousColor('gold')).toBe(false)
  })
})

describe('GARMIN_COLOR_TO_DIFF completeness', () => {
  it('has all expected color keys', () => {
    const expected = ['dark_blue', 'blue', 'light_blue', 'celeste', 'green', 'none', 'gold', 'orange', 'amber', 'red']
    for (const key of expected) {
      expect(GARMIN_COLOR_TO_DIFF).toHaveProperty(key)
    }
  })

  it('all diffs are integers in [-2, 2] range', () => {
    for (const diff of Object.values(GARMIN_COLOR_TO_DIFF)) {
      expect(Number.isInteger(diff)).toBe(true)
      expect(diff).toBeGreaterThanOrEqual(-2)
      expect(diff).toBeLessThanOrEqual(2)
    }
  })
})
