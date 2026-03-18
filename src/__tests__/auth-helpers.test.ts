import { describe, it, expect } from 'vitest'
import { sanitizeNext } from '@/lib/auth-helpers'

describe('sanitizeNext', () => {
  it('permite rutas internas válidas', () => {
    expect(sanitizeNext('/dashboard')).toBe('/dashboard')
    expect(sanitizeNext('/perfil')).toBe('/perfil')
    expect(sanitizeNext('/torneo/slug-torneo')).toBe('/torneo/slug-torneo')
  })
  it('bloquea URLs externas', () => {
    expect(sanitizeNext('https://phishing.com')).toBe('/dashboard')
    expect(sanitizeNext('//evil.com')).toBe('/dashboard')
    expect(sanitizeNext('http://attacker.com/path')).toBe('/dashboard')
  })
  it('devuelve /dashboard para inputs nulos o vacíos', () => {
    expect(sanitizeNext(null)).toBe('/dashboard')
    expect(sanitizeNext('')).toBe('/dashboard')
    expect(sanitizeNext('  ')).toBe('/dashboard')
  })
})
