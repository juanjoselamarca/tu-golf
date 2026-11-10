import { describe, it, expect } from 'vitest'
import {
  MENSAJE_NOMBRE_INVITADO_CORTO,
  MENSAJE_NOMBRE_INVITADO_INVALIDO,
  nombreDeInvitadoValido,
} from './nombre-invitado'

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

// Los textos salen de las mismas constantes que la regla: si cambia un límite, cambia lo que se lee.
describe('mensajes del nombre de invitado', () => {
  it('el formulario y la API dicen los mismos límites que la regla', () => {
    expect(MENSAJE_NOMBRE_INVITADO_CORTO).toBe('Ingresa tu nombre (al menos 2 caracteres).')
    expect(MENSAJE_NOMBRE_INVITADO_INVALIDO).toBe('El nombre debe tener entre 2 y 100 caracteres.')
  })
})
