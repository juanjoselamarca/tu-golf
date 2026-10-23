import { describe, it, expect } from 'vitest'
import { claveSeed, SEED_PASSWORD_ENV } from './clave-seed'

describe('claveSeed', () => {
  it('sin variable de entorno genera una clave al azar, distinta cada vez y dentro del límite de Supabase', () => {
    const a = claveSeed({})
    const b = claveSeed({})
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(16)
    expect(a.length).toBeLessThanOrEqual(72)
  })

  it('una variable vacía o solo espacios cuenta como ausente: genera una al azar', () => {
    expect(claveSeed({ [SEED_PASSWORD_ENV]: '' })).toMatch(/^Seed-/)
    expect(claveSeed({ [SEED_PASSWORD_ENV]: '   ' })).toMatch(/^Seed-/)
  })

  it('usa la clave de la variable de entorno cuando tiene un largo válido', () => {
    expect(claveSeed({ [SEED_PASSWORD_ENV]: 'una-clave-larga-de-seed' })).toBe('una-clave-larga-de-seed')
  })

  it('rechaza una clave corta o más larga que lo que acepta Supabase (72 bytes, no caracteres)', () => {
    expect(() => claveSeed({ [SEED_PASSWORD_ENV]: 'corta' })).toThrow(/16 caracteres y 72 bytes/)
    expect(() => claveSeed({ [SEED_PASSWORD_ENV]: 'x'.repeat(73) })).toThrow(/16 caracteres y 72 bytes/)
    expect(() => claveSeed({ [SEED_PASSWORD_ENV]: 'ñ'.repeat(40) })).toThrow(/72 bytes/) // 40 caracteres, 80 bytes
    expect(claveSeed({ [SEED_PASSWORD_ENV]: 'x'.repeat(72) })).toBe('x'.repeat(72))
  })
})
