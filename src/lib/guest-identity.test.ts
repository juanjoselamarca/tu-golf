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

  it('legacy CON token (aleatorio, sin prueba) se conserva: ya tiene un jugador y el token lo demuestra', async () => {
    localStorage.setItem('gp_guest_id', '22222222-2222-4222-8222-222222222222')
    localStorage.setItem('gp_guest_token', 'tok')
    expect(await obtenerOCrearIdentidadInvitado()).toEqual({ guestId: '22222222-2222-4222-8222-222222222222', prueba: null })
  })

  // Fable #833 P1: un "unirme" que falló (cupo, 429, 500) dejaba un guestId sin token; conservarlo dejaba al
  // teléfono sin forma de demostrar nada si después perdía la respuesta (guest_access_lost para siempre).
  it('legacy SIN token se reemplaza por una identidad con prueba', async () => {
    localStorage.setItem('gp_guest_id', '22222222-2222-4222-8222-222222222222')
    const r = await obtenerOCrearIdentidadInvitado()
    expect(r.guestId).not.toBe('22222222-2222-4222-8222-222222222222')
    expect(r.prueba).not.toBeNull()
    expect(await guestIdDePrueba(r.prueba!)).toBe(r.guestId)
  })

  // Trade-off aceptado (CTO, #833 v2): si ese guestId viejo ya tenía jugador (respuesta perdida antes del
  // cambio), el teléfono se inscribe con la identidad nueva = un posible duplicado que el organizador borra.
  // Lo que NO se acepta es dejarlo sin poder anotar: la identidad nueva siempre trae prueba y nunca reusa la vieja.
  it('legacy sin token que quizá ya tenía jugador: la identidad nueva no lo reusa (posible duplicado, documentado)', async () => {
    localStorage.setItem('gp_guest_id', '33333333-3333-4333-8333-333333333333')
    const nueva = await obtenerOCrearIdentidadInvitado()
    expect(nueva.guestId).not.toBe('33333333-3333-4333-8333-333333333333')
    expect(localStorage.getItem('gp_guest_id')).toBe(nueva.guestId)
    expect(await pruebaDeInvitadoValida(nueva.guestId, nueva.prueba)).toBe(true)
  })

  it('una prueba que no corresponde al guestId guardado (con token) no se manda', async () => {
    localStorage.setItem('gp_guest_id', '22222222-2222-4222-8222-222222222222')
    localStorage.setItem('gp_guest_token', 'tok')
    localStorage.setItem('gp_guest_proof', nuevaPruebaDeInvitado())
    expect((await obtenerOCrearIdentidadInvitado()).prueba).toBeNull()
  })

  it('sin crypto.subtle (fuera de HTTPS) igual crea un guestId UUID v4, sin prueba', async () => {
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: original.getRandomValues.bind(original) }, configurable: true })
    try {
      const r = await obtenerOCrearIdentidadInvitado()
      expect(r.prueba).toBeNull()
      expect(r.guestId).toMatch(UUID_V4)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })

  it('clearGuestSession borra también la prueba', async () => {
    await obtenerOCrearIdentidadInvitado()
    clearGuestSession()
    expect(localStorage.getItem('gp_guest_proof')).toBeNull()
  })
})
