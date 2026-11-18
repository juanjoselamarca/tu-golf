import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react'
import { useRecuperarAccesoInvitado, MENSAJE_RECUPERACION_FALLIDA, MENSAJE_RECUPERACION_SIN_CONEXION, MENSAJE_RECUPERACION_SERVIDOR } from './useRecuperarAccesoInvitado'
import { avisoSinAcceso } from './acceso-guardado'
import { AvisoSinAccesoBanner } from '../components/AvisoSinAccesoBanner'
import { getGuestToken } from '@/lib/guest-session'

// Fable #833 v2 P1: "Volver a entrar" mandaba a /unirse, que con el torneo en juego dice "Inscripciones
// cerradas" sin formulario. La recuperación ocurre en el scorer: POST /guest-join con la prueba.

const GUEST = '22222222-2222-4222-8222-222222222222'
const PRUEBA = 'a'.repeat(64)
const fetchMock = vi.fn()

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('gp_guest_id', GUEST)
  localStorage.setItem('gp_guest_proof', PRUEBA)
  localStorage.setItem('gp_guest_token', 'tok-viejo')
  localStorage.setItem('gp_guest_name', 'Pedro Pérez')
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const responde = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce({ ok: status < 300, status, json: async () => body })

describe('useRecuperarAccesoInvitado', () => {
  it('con la prueba guardada (torneo en juego): recupera el token del MISMO jugador sin inscribir', async () => {
    responde(200, { ok: true, playerId: 'p1', guestToken: 'tok-nuevo', alreadyRegistered: true })
    const onToken = vi.fn()
    const { result } = renderHook(() => useRecuperarAccesoInvitado({ slug: 'copa', onToken }))
    await act(() => result.current.recuperar())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/torneos/copa/guest-join')
    expect(JSON.parse(init.body)).toMatchObject({ guestId: GUEST, guestProof: PRUEBA, soloRecuperar: true, name: 'Pedro Pérez' })
    expect(onToken).toHaveBeenCalledWith('tok-nuevo')
    expect(getGuestToken()).toBe('tok-nuevo')
    expect(result.current.estado).toBe('listo')
  })

  it.each([
    ['403 guest_access_lost', 403, { error: 'guest_access_lost' }, MENSAJE_RECUPERACION_FALLIDA],
    ['404 sin inscripción', 404, { error: 'not_registered' }, MENSAJE_RECUPERACION_FALLIDA],
    ['200 de un alta nueva (no es el mismo jugador)', 200, { ok: true, guestToken: 'otro' }, MENSAJE_RECUPERACION_FALLIDA],
    // Con 429/5xx HAY red: "Sin conexión" sería falso (Fable #833 v3).
    ['503', 503, null, MENSAJE_RECUPERACION_SERVIDOR],
    ['429', 429, null, MENSAJE_RECUPERACION_SERVIDOR],
  ])('%s: error con salida, sin tocar el token', async (_c, status, body, mensaje) => {
    responde(status, body)
    const onToken = vi.fn()
    const { result } = renderHook(() => useRecuperarAccesoInvitado({ slug: 'copa', onToken }))
    await act(() => result.current.recuperar())
    expect(result.current.estado).toBe('error')
    expect(result.current.mensaje).toBe(mensaje)
    expect(onToken).not.toHaveBeenCalled()
    expect(getGuestToken()).toBe('tok-viejo')
  })

  it('fetch que falla por red: "Sin conexión"', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useRecuperarAccesoInvitado({ slug: 'copa', onToken: vi.fn() }))
    await act(() => result.current.recuperar())
    expect(result.current.mensaje).toBe(MENSAJE_RECUPERACION_SIN_CONEXION)
    expect(MENSAJE_RECUPERACION_SERVIDOR).not.toMatch(/sin conexión/i)
  })

  it('sin prueba guardada no llama al servidor: error con salida', async () => {
    localStorage.removeItem('gp_guest_proof')
    const { result } = renderHook(() => useRecuperarAccesoInvitado({ slug: 'copa', onToken: vi.fn() }))
    await act(() => result.current.recuperar())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.estado).toBe('error')
  })
})

describe('AvisoSinAccesoBanner — recuperar en el lugar', () => {
  const aviso = avisoSinAcceso({ slug: 'copa', motivo: 'invitado_sin_acceso', conPruebaDeInvitado: true })

  it('listo: botón "Recuperar mi tarjeta" (no un link a /unirse)', () => {
    const recuperar = vi.fn()
    render(<AvisoSinAccesoBanner aviso={aviso} recuperacion={{ estado: 'listo', mensaje: null, recuperar }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar mi tarjeta' }))
    expect(recuperar).toHaveBeenCalled()
    expect(document.querySelector('a[href*="unirse"]')).toBeNull()
  })

  it('recuperando: botón deshabilitado con "Recuperando…"', () => {
    render(<AvisoSinAccesoBanner aviso={aviso} recuperacion={{ estado: 'recuperando', mensaje: null, recuperar: vi.fn() }} />)
    expect((screen.getByRole('button', { name: 'Recuperando…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('error: dice por qué y deja "Ver el torneo"', () => {
    render(<AvisoSinAccesoBanner aviso={aviso} recuperacion={{ estado: 'error', mensaje: MENSAJE_RECUPERACION_FALLIDA, recuperar: vi.fn() }} />)
    expect(screen.getByText(/No pudimos recuperarla/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver el torneo' }).getAttribute('href')).toBe('/torneo/copa')
  })
})
