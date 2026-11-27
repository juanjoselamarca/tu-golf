import { describe, it, expect } from 'vitest'
import { normalizeRut } from './useFedegolfVincular'

describe('normalizeRut', () => {
  it('quita puntos y normaliza a cuerpo-guion-dv', () => {
    expect(normalizeRut('12.345.678-9')).toBe('12345678-9')
  })

  it('inserta el guion cuando viene sin él', () => {
    expect(normalizeRut('123456789')).toBe('12345678-9')
  })

  it('pone en mayúscula el dígito verificador K', () => {
    expect(normalizeRut('7.654.321-k')).toBe('7654321-K')
  })

  it('recorta espacios sobrantes', () => {
    expect(normalizeRut('  12345678-9  ')).toBe('12345678-9')
  })

  it('no rompe con entrada muy corta', () => {
    expect(normalizeRut('1')).toBe('1')
    expect(normalizeRut('')).toBe('')
  })
})
