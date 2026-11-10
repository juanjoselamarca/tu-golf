import { describe, it, expect } from 'vitest'
import { formatVsPar, vsParColor } from './golf-format'

describe('formatVsPar', () => {
  it('par es "E"', () => expect(formatVsPar(0)).toBe('E'))
  it('over par lleva "+"', () => expect(formatVsPar(3)).toBe('+3'))
  it('bajo par usa signo menos tipográfico (U+2212), no guion', () => {
    expect(formatVsPar(-1)).toBe('−1')
    expect(formatVsPar(-1)).not.toBe('-1') // no hyphen-minus ASCII
  })
})

// formatThru vive en src/golf/leaderboard/thru.ts (tests en thru.test.ts).

describe('vsParColor', () => {
  it('bajo par → dorado de marca', () => expect(vsParColor(-2)).toBe('var(--brand-on-bg)'))
  it('par y over par → sin color (neutro)', () => {
    expect(vsParColor(0)).toBeUndefined()
    expect(vsParColor(4)).toBeUndefined()
  })
})
