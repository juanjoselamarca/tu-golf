import { describe, it, expect } from 'vitest'
import { formatThru } from './thru'

describe('formatThru (convención PGA: hoyos terminados)', () => {
  it('terminó el hoyo 3 y juega el 4 → "3"', () => {
    expect(formatThru(3, 9)).toBe('3')
    expect(formatThru(3, 18)).toBe('3')
  })
  it('ronda terminada → "F", también en 9 hoyos', () => {
    expect(formatThru(9, 9)).toBe('F')
    expect(formatThru(18, 18)).toBe('F')
  })
  it('sin empezar → em dash (no se confunde con −1)', () => {
    expect(formatThru(0, 18)).toBe('—')
  })
  it('una ronda de 9 con 9 hoyos no queda en "9" (bug del marcador por equipos)', () => {
    expect(formatThru(9, 9)).not.toBe('9')
  })
})
