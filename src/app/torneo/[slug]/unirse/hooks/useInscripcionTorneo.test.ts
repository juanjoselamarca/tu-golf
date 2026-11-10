// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const router = { push: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const red = vi.hoisted(() => ({ fetchJsonConPlazo: vi.fn() }))
vi.mock('@/lib/red/fetch-json-con-plazo', () => red)

const guest = vi.hoisted(() => ({
  getOrCreateGuestId: vi.fn(() => 'guest-1'),
  getGuestToken: vi.fn((): string | null => null),
  setGuestName: vi.fn(),
  setGuestHandicap: vi.fn(),
  setGuestToken: vi.fn(),
  clearGuestSession: vi.fn(),
}))
vi.mock('@/lib/guest-session', () => guest)

import { useInscripcionTorneo } from './useInscripcionTorneo'

const respuesta = (status: number, json: unknown) => ({ res: { status, ok: status >= 200 && status < 300 } as Response, json })

const JOIN_INFO = {
  tournament: { id: 't1', name: 'Copa', status: 'open', format: 'stroke_play', date_start: '2026-12-20' },
  profile: { name: 'Ana', indice: 12.3 },
  alreadyRegistered: false,
  authenticated: true,
  capacity: null,
}

async function montar(joinInfo: unknown = JOIN_INFO, status = 200) {
  red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(status, joinInfo))
  const hook = renderHook(() => useInscripcionTorneo('copa'))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useInscripcionTorneo · carga', () => {
  it('sin sesión expone el gate de invitados que adelanta join-info (y "permitido" si no viene)', async () => {
    const sinInvitados = { permitido: false, motivo: 'pro_required' }
    const { result } = await montar({ ...JOIN_INFO, profile: null, authenticated: false, capacity: { full: false, maxPlayers: null, approved: 3 }, invitados: sinInvitados })
    expect(result.current.authenticated).toBe(false)
    expect(result.current.invitados).toEqual(sinInvitados)
    expect(result.current.capacity?.approved).toBe(3)

    const viejo = await montar({ ...JOIN_INFO, profile: null, authenticated: false })
    expect(viejo.result.current.invitados).toEqual({ permitido: true })
  })

  it('con join-info OK expone torneo, perfil y sesión', async () => {
    const { result } = await montar()
    expect(red.fetchJsonConPlazo.mock.calls[0][0]).toBe('/api/torneos/copa/join-info')
    expect(result.current.tournament?.name).toBe('Copa')
    expect(result.current.profile?.indice).toBe(12.3)
    expect(result.current.authenticated).toBe(true)
    expect(result.current.loadFailed).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('404 → "no existe" y ofrece reintento', async () => {
    const { result } = await montar({ error: 'not_found' }, 404)
    expect(result.current.error).toBe('Este torneo no existe o el link es incorrecto.')
    expect(result.current.loadFailed).toBe(true)
    expect(result.current.tournament).toBeNull()
  })

  it('sin red no se queda en "Cargando..." y el reintento recarga', async () => {
    red.fetchJsonConPlazo.mockRejectedValueOnce(new Error('timeout'))
    const { result } = renderHook(() => useInscripcionTorneo('copa'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadFailed).toBe(true)
    expect(result.current.error).toMatch(/Revisa tu señal/)

    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(200, JOIN_INFO))
    act(() => result.current.reintentarCarga())
    await waitFor(() => expect(result.current.tournament?.name).toBe('Copa'))
    expect(result.current.loadFailed).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

describe('useInscripcionTorneo · inscripción con cuenta', () => {
  it('POST OK → éxito', async () => {
    const { result } = await montar()
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(200, { ok: true }))
    await act(() => result.current.handleInscribirse())
    expect(red.fetchJsonConPlazo.mock.calls[1][0]).toBe('/api/torneos/copa/inscribirse')
    expect(result.current.success).toBe(true)
    expect(result.current.inscribing).toBe(false)
  })

  it('already_registered → estado ya inscrito, no éxito', async () => {
    const { result } = await montar()
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(409, { error: 'already_registered', message: 'Ya estás inscrito en este torneo.' }))
    await act(() => result.current.handleInscribirse())
    expect(result.current.alreadyRegistered).toBe(true)
    expect(result.current.success).toBe(false)
    expect(result.current.error).toBe('Ya estás inscrito en este torneo.')
  })

  it('sin red → mensaje para reintentar y el botón se libera', async () => {
    const { result } = await montar()
    red.fetchJsonConPlazo.mockRejectedValueOnce(new Error('timeout'))
    await act(() => result.current.handleInscribirse())
    expect(result.current.error).toMatch(/No pudimos confirmar tu inscripción/)
    expect(result.current.inscribing).toBe(false)
  })
})

describe('useInscripcionTorneo · invitado', () => {
  const ANON = { ...JOIN_INFO, profile: null, authenticated: false }

  it('nombre de menos de 2 letras no llama al servidor', async () => {
    const { result } = await montar(ANON)
    act(() => result.current.setGuestName(' a '))
    await act(() => result.current.handleGuestJoin())
    expect(result.current.error).toBe('Ingresa tu nombre (al menos 2 caracteres).')
    expect(red.fetchJsonConPlazo).toHaveBeenCalledTimes(1)
  })

  it('OK → guarda la sesión de invitado y va al scorer', async () => {
    const { result } = await montar(ANON)
    act(() => {
      result.current.setGuestName('  Pedro Pérez ')
      result.current.setGuestHandicap('18.5')
    })
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(200, { guestToken: 'tok' }))
    await act(() => result.current.handleGuestJoin())
    const [url, init] = red.fetchJsonConPlazo.mock.calls[1]
    expect(url).toBe('/api/torneos/copa/guest-join')
    expect(JSON.parse(init.body)).toEqual({ guestId: 'guest-1', name: 'Pedro Pérez', handicap: 18.5 })
    expect(guest.setGuestName).toHaveBeenCalledWith('Pedro Pérez')
    expect(guest.setGuestHandicap).toHaveBeenCalledWith(18.5)
    expect(guest.setGuestToken).toHaveBeenCalledWith('tok')
    expect(router.push).toHaveBeenCalledWith('/torneo/copa/score')
  })

  // El server sólo reemite el token a quien pruebe que ya lo tenía (403 guest_token_required):
  // si este dispositivo lo tiene guardado, va en el body.
  it('con token guardado → lo manda para que el server pueda reemitirlo', async () => {
    guest.getGuestToken.mockReturnValueOnce('tok-guardado')
    const { result } = await montar(ANON)
    act(() => result.current.setGuestName('Pedro'))
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(200, { guestToken: 'tok-nuevo' }))
    await act(() => result.current.handleGuestJoin())
    const [, init] = red.fetchJsonConPlazo.mock.calls[1]
    expect(JSON.parse(init.body).guestToken).toBe('tok-guardado')
  })

  // La respuesta del primer POST se perdió (señal de cancha): el jugador quedó creado con un
  // guestId cuyo token este dispositivo nunca guardó, y el server ya no lo reemite.
  it('guest_token_required → entra con un invitado nuevo, una sola vez', async () => {
    guest.getGuestToken.mockReturnValueOnce('tok-viejo')
    guest.getOrCreateGuestId.mockReturnValueOnce('guest-1').mockReturnValueOnce('guest-2')
    const { result } = await montar(ANON)
    act(() => result.current.setGuestName('Pedro'))
    red.fetchJsonConPlazo
      .mockResolvedValueOnce(respuesta(403, { error: 'guest_token_required', message: 'Esa inscripción es de otro dispositivo.' }))
      .mockResolvedValueOnce(respuesta(200, { guestToken: 'tok-guest-2' }))
    await act(() => result.current.handleGuestJoin())
    expect(guest.clearGuestSession).toHaveBeenCalledOnce()
    expect(JSON.parse(red.fetchJsonConPlazo.mock.calls[1][1].body)).toMatchObject({ guestId: 'guest-1', guestToken: 'tok-viejo' })
    const reintento = JSON.parse(red.fetchJsonConPlazo.mock.calls[2][1].body)
    expect(reintento.guestId).toBe('guest-2')
    expect(reintento.guestToken).toBeUndefined()
    expect(guest.setGuestToken).toHaveBeenCalledWith('tok-guest-2')
    expect(router.push).toHaveBeenCalledWith('/torneo/copa/score')
  })

  it('guest_token_required también en el reintento → muestra el mensaje, no reintenta más', async () => {
    const { result } = await montar(ANON)
    act(() => result.current.setGuestName('Pedro'))
    const rechazo = respuesta(403, { error: 'guest_token_required', message: 'Esa inscripción es de otro dispositivo.' })
    red.fetchJsonConPlazo.mockResolvedValueOnce(rechazo).mockResolvedValueOnce(rechazo)
    await act(() => result.current.handleGuestJoin())
    expect(red.fetchJsonConPlazo).toHaveBeenCalledTimes(3)
    expect(result.current.error).toBe('Esa inscripción es de otro dispositivo.')
    expect(result.current.guestJoining).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('error del servidor → muestra su mensaje y libera el botón', async () => {
    const { result } = await montar(ANON)
    act(() => result.current.setGuestName('Pedro'))
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(403, { message: 'Este torneo es solo para cuentas Pro.' }))
    await act(() => result.current.handleGuestJoin())
    expect(result.current.error).toBe('Este torneo es solo para cuentas Pro.')
    expect(result.current.guestJoining).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
  })
})

// El campo era type=number + parseFloat: "+1.5" llegaba como 1.5 (o '' y sin hándicap) y "18,5" como 18.
describe('useInscripcionTorneo · hándicap del invitado', () => {
  const ANON = { ...JOIN_INFO, profile: null, authenticated: false }

  it.each([['+1.5', -1.5], ['18,5', 18.5], [' -2 ', -2]])('"%s" se envía como %s', async (texto, valor) => {
    const { result } = await montar(ANON)
    act(() => {
      result.current.setGuestName('Pedro Pérez')
      result.current.setGuestHandicap(texto)
    })
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(200, { guestToken: 'tok' }))
    await act(() => result.current.handleGuestJoin())
    const [, init] = red.fetchJsonConPlazo.mock.calls[1]
    expect(JSON.parse(init.body).handicap).toBe(valor)
    expect(guest.setGuestHandicap).toHaveBeenCalledWith(valor)
  })

  it('vacío → se inscribe sin hándicap', async () => {
    const { result } = await montar(ANON)
    act(() => result.current.setGuestName('Pedro Pérez'))
    red.fetchJsonConPlazo.mockResolvedValueOnce(respuesta(200, { guestToken: 'tok' }))
    await act(() => result.current.handleGuestJoin())
    const [, init] = red.fetchJsonConPlazo.mock.calls[1]
    expect(JSON.parse(init.body).handicap).toBeUndefined()
  })

  it.each(['abc', '+'])('"%s" no llama al servidor ni pone el banner genérico (el aviso va en el campo)', async texto => {
    const { result } = await montar(ANON)
    act(() => {
      result.current.setGuestName('Pedro Pérez')
      result.current.setGuestHandicap(texto)
    })
    await act(() => result.current.handleGuestJoin())
    expect(red.fetchJsonConPlazo).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })
})
