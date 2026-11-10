import { describe, it, expect } from 'vitest'
import { nombreDeInvitadoValido } from './nombre-invitado'

describe('nombreDeInvitadoValido', () => {
  it.each(['Pe', ' Pedro ', 'x'.repeat(100), ` ${'x'.repeat(100)} `])('"%s" vale', n => {
    expect(nombreDeInvitadoValido(n)).toBe(true)
  })
  it.each(['', 'P', '  P  ', '   ', 'x'.repeat(101)])('"%s" no vale', n => {
    expect(nombreDeInvitadoValido(n)).toBe(false)
  })
  it.each([undefined, null, 12, {}])('%s (no es texto) no vale', n => {
    expect(nombreDeInvitadoValido(n)).toBe(false)
  })
})
