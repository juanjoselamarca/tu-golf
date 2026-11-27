import { describe, it, expect } from 'vitest'
import { fechaDeLaRonda } from './fecha-de-la-ronda'

describe('fechaDeLaRonda', () => {
  it('muestra el día de la ronda, sin correrse al anterior por el huso', () => {
    expect(fechaDeLaRonda('2026-11-28')).toMatch(/^28/)
    expect(fechaDeLaRonda('2026-11-28')).toMatch(/2026/)
  })
  it('sin fecha, vacío', () => {
    expect(fechaDeLaRonda(null)).toBe('')
    expect(fechaDeLaRonda(undefined)).toBe('')
    expect(fechaDeLaRonda('')).toBe('')
  })
})
