import { describe, it, expect } from 'vitest'
import { esFalloTransitorioDeAuth } from './fallo-transitorio-auth'

describe('esFalloTransitorioDeAuth', () => {
  it('red caída / gateway: pasajero', () => {
    expect(esFalloTransitorioDeAuth({ name: 'AuthRetryableFetchError', status: 0 })).toBe(true)
    expect(esFalloTransitorioDeAuth({ name: 'AuthRetryableFetchError', status: 504 })).toBe(true)
    expect(esFalloTransitorioDeAuth({ name: 'AuthApiError', status: 500 })).toBe(true)
    expect(esFalloTransitorioDeAuth({ name: 'AuthUnknownError', status: 502 })).toBe(true)
  })

  it('sin sesión o JWT inválido: NO pasajero (es un 401 de verdad)', () => {
    expect(esFalloTransitorioDeAuth(null)).toBe(false)
    expect(esFalloTransitorioDeAuth(undefined)).toBe(false)
    expect(esFalloTransitorioDeAuth({ name: 'AuthSessionMissingError', status: 400 })).toBe(false)
    expect(esFalloTransitorioDeAuth({ name: 'AuthApiError', status: 401 })).toBe(false)
    expect(esFalloTransitorioDeAuth({ name: 'AuthApiError', status: 403 })).toBe(false)
  })
})
