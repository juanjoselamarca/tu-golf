// src/__tests__/draft/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, _resetForTest } from '@/lib/draft/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => _resetForTest())

  it('permite primera llamada', () => {
    const r = checkRateLimit('user-1', 'msg-1')
    expect(r.allowed).toBe(true)
  })

  it('bloquea después de 30 calls/h', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('user-1', `m${i}`)
    const r = checkRateLimit('user-1', 'm31')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('rate_limit')
  })

  it('detecta loop: mismo mensaje 5 veces', () => {
    for (let i = 0; i < 4; i++) checkRateLimit('user-2', 'spam')
    const r = checkRateLimit('user-2', 'spam')
    expect(r.allowed).toBe(true) // la 5ta pasa, la 6ta no
    const r2 = checkRateLimit('user-2', 'spam')
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('loop_detected')
  })

  it('users distintos no se afectan', () => {
    for (let i = 0; i < 30; i++) checkRateLimit('user-3', `m${i}`)
    expect(checkRateLimit('user-4', 'm0').allowed).toBe(true)
  })
})
