// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { webcrypto } from 'node:crypto'

// jsdom (entorno de los tests) no trae `crypto.subtle`; el navegador en HTTPS y Node sí.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
import { esPruebaDeInvitado, guestIdDePrueba, nuevaPruebaDeInvitado, pruebaDeInvitadoValida } from './guest-identity'
import { clearGuestSession, getGuestId, obtenerOCrearIdentidadInvitado } from './guest-session'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('guest-identity', () => {
  it('la prueba es de 64 hex y el guestId que deriva es un UUID v4 estable', async () => {
    const prueba = nuevaPruebaDeInvitado()
    expect(esPruebaDeInvitado(prueba)).toBe(true)
    const id = await guestIdDePrueba(prueba)
    expect(id).toMatch(UUID_V4)
    expect(await guestIdDePrueba(prueba)).toBe(id)
  })

  it('sólo la prueba de ESE guestId lo demuestra (mayúsculas en el guestId no cambian nada)', async () => {
    const prueba = nuevaPruebaDeInvitado()
    const id = await guestIdDePrueba(prueba)
    expect(await pruebaDeInvitadoValida(id.toUpperCase(), prueba)).toBe(true)
    expect(await pruebaDeInvitadoValida(id, nuevaPruebaDeInvitado())).toBe(false)
    expect(await pruebaDeInvitadoValida(id, undefined)).toBe(false)
    expect(await pruebaDeInvitadoValida(id, prueba.toUpperCase())).toBe(false)
  })
})

describe('obtenerOCrearIdentidadInvitado', () => {
  beforeEach(() => { localStorage.clear() })

  it('sin identidad: crea una con prueba, y la siguiente llamada devuelve la misma', async () => {
    const nueva = await obtenerOCrearIdentidadInvitado()
    expect(nueva.prueba).not.toBeNull()
    expect(await guestIdDePrueba(nueva.prueba!)).toBe(nueva.guestId)
    expect(getGuestId()).toBe(nueva.guestId)
    expect(await obtenerOCrearIdentidadInvitado()).toEqual(nueva)
  })

  it('un guestId anterior (aleatorio, sin prueba) se conserva: puede tener ya un jugador', async () => {
    localStorage.setItem('gp_guest_id', '22222222-2222-4222-8222-222222222222')
    expect(await obtenerOCrearIdentidadInvitado()).toEqual({ guestId: '22222222-2222-4222-8222-222222222222', prueba: null })
  })

  it('una prueba que no corresponde al guestId guardado no se manda', async () => {
    localStorage.setItem('gp_guest_id', '22222222-2222-4222-8222-222222222222')
    localStorage.setItem('gp_guest_proof', nuevaPruebaDeInvitado())
    expect((await obtenerOCrearIdentidadInvitado()).prueba).toBeNull()
  })

  it('clearGuestSession borra también la prueba', async () => {
    await obtenerOCrearIdentidadInvitado()
    clearGuestSession()
    expect(localStorage.getItem('gp_guest_proof')).toBeNull()
  })
})
