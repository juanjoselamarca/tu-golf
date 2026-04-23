/**
 * Tests para src/lib/rate-limit.ts — rate limiter in-memory.
 *
 * Cobertura previa: 0%. Usado en API routes sensibles (taiger chat,
 * screenshot import, etc.) para evitar abuso.
 */
import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest'
import { checkRateLimit, rateLimitHeaders } from './rate-limit'

// El módulo registra un setInterval a module-load. Limpiamos al final.
afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  // Consumir el counter interno con keys únicos para aislar tests
})

describe('checkRateLimit', () => {
  it('primer request → allowed=true con remaining=max-1', () => {
    const r = checkRateLimit('test-key-1', 5, 60_000)
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(4)
    expect(r.resetAt).toBeGreaterThan(Date.now())
  })

  it('segundo request dentro de ventana → remaining decrece', () => {
    const k = 'test-key-2'
    checkRateLimit(k, 5, 60_000)
    const r2 = checkRateLimit(k, 5, 60_000)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(3)
  })

  it('pasar el max → allowed=false', () => {
    const k = 'test-key-3'
    for (let i = 0; i < 3; i++) checkRateLimit(k, 3, 60_000)
    const r = checkRateLimit(k, 3, 60_000)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('remaining no va negativo al exceder mucho', () => {
    const k = 'test-key-4'
    for (let i = 0; i < 10; i++) checkRateLimit(k, 2, 60_000)
    const r = checkRateLimit(k, 2, 60_000)
    expect(r.remaining).toBe(0) // clamp en 0, no -9
    expect(r.allowed).toBe(false)
  })

  it('keys distintas tienen contadores independientes', () => {
    const r1 = checkRateLimit('user-a', 3, 60_000)
    const r2 = checkRateLimit('user-b', 3, 60_000)
    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(2) // independiente
  })

  it('ventana expirada → cuenta se resetea', () => {
    vi.useFakeTimers()
    const k = 'test-key-5'
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    checkRateLimit(k, 2, 1000)
    checkRateLimit(k, 2, 1000)
    const r1 = checkRateLimit(k, 2, 1000)
    expect(r1.allowed).toBe(false)

    // Avanzar 2 segundos (más allá de la ventana)
    vi.setSystemTime(new Date('2026-01-01T10:00:02Z'))
    const r2 = checkRateLimit(k, 2, 1000)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)
    vi.useRealTimers()
  })
})

describe('rateLimitHeaders', () => {
  it('formatea X-RateLimit-Remaining y X-RateLimit-Reset', () => {
    const resetAt = Date.parse('2026-04-23T15:00:00Z')
    const headers = rateLimitHeaders({ allowed: true, remaining: 5, resetAt })
    expect(headers['X-RateLimit-Remaining']).toBe('5')
    expect(headers['X-RateLimit-Reset']).toBe('2026-04-23T15:00:00.000Z')
  })

  it('remaining=0 se stringifica correctamente', () => {
    const headers = rateLimitHeaders({ allowed: false, remaining: 0, resetAt: Date.now() })
    expect(headers['X-RateLimit-Remaining']).toBe('0')
  })
})
