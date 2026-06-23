import { describe, it, expect } from 'vitest'
import { computeKeyboardInset } from './useVisualViewport'

describe('computeKeyboardInset — alto tapado por el teclado', () => {
  it('sin teclado (visual == layout) → 0', () => {
    expect(computeKeyboardInset(844, 844, 0)).toBe(0)
  })

  it('teclado abierto achica el visual viewport → inset = diferencia', () => {
    // iPhone 13: layout 844, teclado ~336 → visual 508.
    expect(computeKeyboardInset(844, 508, 0)).toBe(336)
  })

  it('tiene en cuenta offsetTop (pinch-zoom / scroll del visual viewport)', () => {
    expect(computeKeyboardInset(844, 500, 44)).toBe(300)
  })

  it('nunca devuelve negativo (clamp) ante diferencias por redondeo', () => {
    expect(computeKeyboardInset(844, 845, 0)).toBe(0)
    expect(computeKeyboardInset(844, 844, 2)).toBe(0)
  })

  it('redondea sub-píxeles para no producir jitter', () => {
    expect(computeKeyboardInset(844.4, 508.1, 0)).toBe(336)
  })
})
