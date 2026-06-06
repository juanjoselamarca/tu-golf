import { describe, it, expect } from 'vitest'
import { projectScore } from '../breakdown'

describe('projectScore', () => {
  it('rechaza el desglose falso del bug original (7+8+3 dobles ≠ 79)', () => {
    // El bug: el LLM afirmó que 7 pares + 8 bogeys + 3 dobles = 79 en par 72.
    // sobre par real = 8*1 + 3*2 = +14 → 86. projectScore NUNCA debe producir 79
    // a partir de ese reparto.
    const r = projectScore({ parTotal: 72, holes: 18, distribution: { par: 7, bogey: 8, double: 3 } })
    expect(r.over).toBe(14)
    expect(r.absolute).toBe(86)
  })

  it('cualquier desglose emitido cierra: absolute === parTotal + over', () => {
    const r = projectScore({ parTotal: 72, holes: 18, targetOver: 7 })
    expect(r.absolute).toBe(72 + 7)
    // la suma de hoyos del reparto sugerido === holes
    const sumHoles = Object.values(r.distribution).reduce((a, b) => a + b, 0)
    expect(sumHoles).toBe(18)
    // el over implícito del reparto === over pedido
    const over =
      r.distribution.bogey * 1 + r.distribution.double * 2 + r.distribution.triple * 3 -
      r.distribution.birdie * 1 - r.distribution.eagle * 2
    expect(over).toBe(7)
  })

  it('sin par confiable emite relativo (+N) y absolute = null', () => {
    const r = projectScore({ parTotal: null, holes: 18, targetOver: 7 })
    expect(r.absolute).toBeNull()
    expect(r.over).toBe(7)
    expect(r.relativeLabel).toBe('+7')
  })

  it('property: para over en [-18..36], el reparto construido cierra y suma holes', () => {
    for (let over = -18; over <= 36; over++) {
      const r = projectScore({ parTotal: 72, holes: 18, targetOver: over })
      const sumHoles = Object.values(r.distribution).reduce((a, b) => a + b, 0)
      expect(sumHoles, `holes para over=${over}`).toBe(18)
      expect(r.over, `over para over=${over}`).toBe(over)
      expect(r.absolute, `absolute para over=${over}`).toBe(72 + over)
    }
  })

  it('property: 9 hoyos también cierra', () => {
    for (let over = -9; over <= 18; over++) {
      const r = projectScore({ parTotal: 36, holes: 9, targetOver: over })
      expect(Object.values(r.distribution).reduce((a, b) => a + b, 0)).toBe(9)
      expect(r.over).toBe(over)
    }
  })
})
