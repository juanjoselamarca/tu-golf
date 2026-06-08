import { describe, it, expect } from 'vitest'
import { formatVsPar, formatThru, vsParColor, computePositions } from './golf-format'

describe('formatVsPar', () => {
  it('par es "E"', () => expect(formatVsPar(0)).toBe('E'))
  it('over par lleva "+"', () => expect(formatVsPar(3)).toBe('+3'))
  it('bajo par usa signo menos tipográfico (U+2212), no guion', () => {
    expect(formatVsPar(-1)).toBe('−1')
    expect(formatVsPar(-1)).not.toBe('-1') // no hyphen-minus ASCII
  })
})

describe('formatThru', () => {
  it('hoyos completos → "F"', () => expect(formatThru(18)).toBe('F'))
  it('9 de 18 → "9"', () => expect(formatThru(9)).toBe('9'))
  it('sin empezar → em dash "—" (no se confunde con un score bajo par)', () => {
    expect(formatThru(0)).toBe('—')
  })
  it('respeta holeCount de 9 hoyos', () => expect(formatThru(9, 9)).toBe('F'))
})

describe('vsParColor', () => {
  it('bajo par → dorado de marca', () => expect(vsParColor(-2)).toBe('var(--brand-on-bg)'))
  it('par y over par → sin color (neutro)', () => {
    expect(vsParColor(0)).toBeUndefined()
    expect(vsParColor(4)).toBeUndefined()
  })
})

describe('computePositions — empates estilo golf', () => {
  it('sin empates → posiciones secuenciales', () => {
    expect(computePositions([-1, 3, 6])).toEqual(['1', '2', '3'])
  })
  it('un empate en 2do → comparten "T2" y se salta el 3', () => {
    expect(computePositions([-1, 3, 3, 6])).toEqual(['1', 'T2', 'T2', '4'])
  })
  it('empate en el liderato → "T1", "T1", luego 3', () => {
    expect(computePositions([-5, -5, 2])).toEqual(['T1', 'T1', '3'])
  })
  it('triple empate', () => {
    expect(computePositions([0, 0, 0, 5])).toEqual(['T1', 'T1', 'T1', '4'])
  })
  it('métrica "más es mejor" (stableford, orden desc) también empata por igualdad', () => {
    expect(computePositions([40, 38, 38, 30])).toEqual(['1', 'T2', 'T2', '4'])
  })
  it('lista vacía y singleton', () => {
    expect(computePositions([])).toEqual([])
    expect(computePositions([3])).toEqual(['1'])
  })
})
