// src/__tests__/draft/share-token.test.ts
import { describe, it, expect } from 'vitest'
import { generateShareToken, isTokenExpired } from '@/lib/draft/share-token'

describe('share-token', () => {
  it('genera token de 32 chars alfa-num', () => {
    const t = generateShareToken()
    expect(t).toHaveLength(32)
    expect(t).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('genera tokens distintos cada vez', () => {
    expect(generateShareToken()).not.toBe(generateShareToken())
  })

  it('isTokenExpired detecta expiración', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isTokenExpired(past)).toBe(true)
    expect(isTokenExpired(future)).toBe(false)
  })
})
