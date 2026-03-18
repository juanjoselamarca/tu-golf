import { describe, it, expect } from 'vitest'
import { isAdminEmail } from '@/lib/admin'

describe('isAdminEmail', () => {
  it('rechaza email vacío o nulo', () => {
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })
  it('rechaza email no incluido en ADMIN_EMAILS', () => {
    expect(isAdminEmail('random@email.com')).toBe(false)
  })
})
