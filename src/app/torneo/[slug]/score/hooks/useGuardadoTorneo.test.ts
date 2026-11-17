import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
const fetchRoundHoleScores = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (...a: unknown[]) => fetchRoundHoleScores(...a),
}))

import { useGuardadoTorneo, type UseGuardadoTorneoArgs } from './useGuardadoTorneo'
import { claveDelRespaldo, leerRespaldoPendiente } from '@/lib/ronda/respaldo-local'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { CourseHole } from '@/golf/leaderboard/types'

// Scorer del torneo: caracterización del guardado (lo que hacía page.tsx antes de extraerlo) y el
// arreglo del PR #754 (401/403 ya no caen en "guardado localmente, se sincronizará").

const SLUG = 'copa-test'
const RONDA = 'ronda-1'
const torneo = { id: 't1', formato_juego: 'stroke_play', modo_juego: 'gross' } as unknown as ScoringTournament
const jugador = { id: 'p1', rounds: [{ id: RONDA }] } as unknown as ScoringPlayer
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, handicap: i + 1 })) as unknown as CourseHole[]

type Respuesta = { status: number; body?: unknown } | 'red'
let respuestas: Respuesta[] = []
const enviados: Array<{ hole: number; gross: number }> = []
const conHeadersInvitado: boolean[] = []
/** Si se define, el próximo fetch queda colgado hasta que el test lo suelte. */
let colgar: Promise<void> | null = null
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as { hole_number: number; gross_score: number }
  enviados.push({ hole: body.hole_number, gross: body.gross_score })
  conHeadersInvitado.push(!!(init.headers as Record<string, string>)['x-guest-id'])
  if (colgar) { const c = colgar; colgar = null; await c }
  const r = respuestas.length > 1 ? respuestas.shift()! : respuestas[0]
  if (r === 'red' || r === undefined) throw new TypeError('Failed to fetch')
  return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
})

function args(extra: Partial<UseGuardadoTorneoArgs> = {}): UseGuardadoTorneoArgs {
  return {
    slug: SLUG, tournament: torneo, player: jugador, roundId: RONDA, contextoListo: true,
    hoyosRonda: hoyos, holeCount: 18, courseHcpDe: () => 0, bloqueado: false,
    guestId: null, guestToken: null, onRondaCerrada: vi.fn(), onInvitadoCompleto: vi.fn(),
    ...extra,
  }
}

const respaldo = () => leerRespaldoPendiente(SLUG, RONDA)
function dejarPendiente(scores: Record<number, number>) {
  localStorage.setItem(claveDelRespaldo(SLUG, RONDA), JSON.stringify({ scores, timestamp: Date.now(), sincronizado: false, codigoRonda: SLUG, jugadorId: RONDA }))
}

async function montar(extra: Partial<UseGuardadoTorneoArgs> = {}) {
  const h = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args(extra) })
  await waitFor(() => expect(fetchRoundHoleScores).toHaveBeenCalled())
  await act(async () => {}) // termina la carga (lo del servidor queda confirmado)
  return h
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  respuestas = [{ status: 200 }]
  enviados.length = 0
  conHeadersInvitado.length = 0
  colgar = null
  fetchMock.mockClear()
  addToast.mockReset()
  fetchRoundHoleScores.mockReset().mockResolvedValue([])
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('useGuardadoTorneo — caracterización', () => {
  it('guarda el hoyo: ✓ guardado y la cola queda confirmada', async () => {
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(3, '5') })
    expect(result.current.saveStatus).toBe('saved')
    expect(result.current.savedHoles.has(3)).toBe(true)
    expect(result.current.currentScores[3]).toBe(5)
    expect(respaldo()).toBeNull()
  })

  it('valores fuera de rango o tarjeta bloqueada: no envía nada', async () => {
    const { result, rerender } = await montar()
    await act(async () => { await result.current.guardarHoyo(3, '0') })
    await act(async () => { await result.current.guardarHoyo(3, 'x') })
    rerender(args({ bloqueado: true }))
    await act(async () => { await result.current.guardarHoyo(3, '5') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('red caída / 5xx: reintenta 3 veces, avisa "guardado localmente" y conserva la cola', async () => {
    respuestas = [{ status: 503 }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(4, '6') })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current.saveStatus).toBe('error')
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Se sincronizará') }))
    expect(respaldo()).toEqual({ 4: 6 })
  })

  it('409 round_closed: no reintenta, descarta la cola y pide recargar el roster', async () => {
    respuestas = [{ status: 409, body: { code: 'round_closed' } }]
    const onRondaCerrada = vi.fn()
    const { result } = await montar({ onRondaCerrada })
    await act(async () => { await result.current.guardarHoyo(4, '6') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onRondaCerrada).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('idle')
    expect(respaldo()).toBeNull()
  })

  it('409 de torneo inactivo: torneoInactivo y un solo aviso', async () => {
    respuestas = [{ status: 409, body: { code: 'tournament_inactive' } }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(4, '6') })
    expect(result.current.torneoInactivo).toBe(true)
    await act(async () => { await result.current.guardarHoyo(5, '6') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(addToast).toHaveBeenCalledTimes(1)
  })

  it('al cargar mezcla lo pendiente del teléfono con lo del servidor', async () => {
    fetchRoundHoleScores.mockResolvedValue([{ hole_number: 1, gross_score: 4 }])
    dejarPendiente({ 1: 4, 2: 7 })
    respuestas = ['red']
    const { result } = await montar()
    await waitFor(() => expect(result.current.currentScores).toEqual({ 1: 4, 2: 7 }))
  })

  it('teléfono compartido: con la lectura caída al cambiar de jugador, la tarjeta queda vacía (nunca los golpes del anterior)', async () => {
    fetchRoundHoleScores.mockResolvedValueOnce([{ hole_number: 1, gross_score: 9 }])
    const { result, rerender } = await montar()
    await waitFor(() => expect(result.current.currentScores).toEqual({ 1: 9 }))
    fetchRoundHoleScores.mockRejectedValueOnce(new Error('timeout'))
    const otro = { id: 'p2', rounds: [{ id: 'ronda-2' }] } as unknown as ScoringPlayer
    rerender(args({ player: otro, roundId: 'ronda-2' }))
    await waitFor(() => expect(result.current.currentScores).toEqual({}))
  })

  it('"Cambiar jugador" (sin jugador elegido): la tarjeta queda vacía', async () => {
    fetchRoundHoleScores.mockResolvedValueOnce([{ hole_number: 1, gross_score: 9 }])
    const { result, rerender } = await montar()
    await waitFor(() => expect(result.current.currentScores).toEqual({ 1: 9 }))
    rerender(args({ player: undefined, roundId: null }))
    await waitFor(() => expect(result.current.currentScores).toEqual({}))
  })

  it('invitado: manda sus headers y al completar la tarjeta pide registrarse', async () => {
    const onInvitadoCompleto = vi.fn()
    const { result } = await montar({ guestId: 'g1', guestToken: 'tok', holeCount: 1, onInvitadoCompleto })
    await act(async () => { await result.current.guardarHoyo(1, '4') })
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['x-guest-id']).toBe('g1')
    expect(headers['x-guest-token']).toBe('tok')
    expect(onInvitadoCompleto).toHaveBeenCalledTimes(1)
  })
})

describe('useGuardadoTorneo — 401/403 (PR #754)', () => {
  it('401: no reintenta, no dice "reintentando", conserva la cola y ofrece iniciar sesión', async () => {
    respuestas = [{ status: 401 }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.saveStatus).toBe('sin_acceso')
    expect(result.current.saveError).toBeNull()
    expect(addToast).not.toHaveBeenCalled()
    expect(respaldo()).toEqual({ 7: 5 })
    expect(result.current.sinAcceso?.cta).toBe('Iniciar sesión')
    expect(result.current.sinAcceso?.href).toContain('/login')
  })

  it('403 de jugador con cuenta: aviso "no aceptó" con salida al torneo', async () => {
    respuestas = [{ status: 403 }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(result.current.sinAcceso?.href).toBe(`/torneo/${SLUG}`)
    expect(respaldo()).toEqual({ 7: 5 })
  })

  it('403 guest_token_invalid y sin sesión con cuenta: aviso de invitado al organizador, nunca a /unirse', async () => {
    respuestas = [{ status: 403, body: { code: 'guest_token_invalid' } }, { status: 401 }]
    const { result } = await montar({ guestId: 'g1', guestToken: 'tok' })
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(conHeadersInvitado).toEqual([true, false])
    expect(result.current.sinAcceso?.titulo).toMatch(/invitado/)
    expect(result.current.sinAcceso?.href).toBe(`/torneo/${SLUG}`)
    expect(respaldo()).toEqual({ 7: 5 })
  })

  it('403 guest_not_owner (invitado sano, tarjeta de otro) y sin sesión: "no está a tu nombre", no "tu acceso ya no sirve"', async () => {
    respuestas = [{ status: 403, body: { code: 'guest_not_owner' } }, { status: 401 }]
    const { result } = await montar({ guestId: 'g1', guestToken: 'tok' })
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(conHeadersInvitado).toEqual([true, false])
    expect(result.current.sinAcceso?.titulo).not.toMatch(/invitado/)
    expect(result.current.sinAcceso?.detalle).toMatch(/no está a tu nombre/)
    expect(result.current.sinAcceso?.detalle).toMatch(/Cambiar jugador/)
  })

  it('al cambiar de tarjeta vuelve a probar con los headers de invitado', async () => {
    respuestas = [{ status: 403, body: { code: 'guest_not_owner' } }, { status: 200 }]
    const { result, rerender } = await montar({ guestId: 'g1', guestToken: 'tok' })
    await act(async () => { await result.current.guardarHoyo(1, '5') })
    expect(conHeadersInvitado).toEqual([true, false])
    const otro = { id: 'p2', rounds: [{ id: 'ronda-2' }] } as unknown as ScoringPlayer
    rerender(args({ guestId: 'g1', guestToken: 'tok', player: otro, roundId: 'ronda-2' }))
    await act(async () => {})
    await act(async () => { await result.current.guardarHoyo(1, '4') })
    expect(conHeadersInvitado).toEqual([true, false, true])
  })

  it('403 guest_not_owner con sesión de cuenta (guestId viejo): entra sin headers y deja de mandarlos', async () => {
    respuestas = [{ status: 403, body: { code: 'guest_not_owner' } }, { status: 200 }]
    const onInvitadoCompleto = vi.fn()
    const { result } = await montar({ guestId: 'g1', guestToken: 'tok', holeCount: 2, onInvitadoCompleto })
    await act(async () => { await result.current.guardarHoyo(1, '5') })
    expect(result.current.saveStatus).toBe('saved')
    await act(async () => { await result.current.guardarHoyo(2, '4') })
    expect(conHeadersInvitado).toEqual([true, false, false])
    // No es invitado: no se le ofrece registrarse al completar.
    expect(onInvitadoCompleto).not.toHaveBeenCalled()
  })

  it('403 player_withdrawn: aviso de retirado, sin reinscripción', async () => {
    respuestas = [{ status: 403, body: { code: 'player_withdrawn' } }]
    const { result } = await montar({ guestId: 'g1', guestToken: 'tok' })
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.sinAcceso?.titulo).toMatch(/retirado/i)
    expect(result.current.sinAcceso?.href).toBe(`/torneo/${SLUG}`)
  })

  it('el login vuelve a esta tarjeta con el jugador elegido', async () => {
    respuestas = [{ status: 401 }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(result.current.sinAcceso?.href).toBe(`/login?next=${encodeURIComponent(`/torneo/${SLUG}/score?jugador=p1`)}`)
  })

  it('tras un 403, "Cambiar jugador" deja el badge en reposo (no "No guardado" sobre una tarjeta sana)', async () => {
    respuestas = [{ status: 403 }]
    const { result, rerender } = await montar()
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(result.current.saveStatus).toBe('sin_acceso')
    rerender(args({ player: undefined, roundId: null }))
    await waitFor(() => expect(result.current.saveStatus).toBe('idle'))
    expect(result.current.sinAcceso).toBeNull()
  })

  it('al abrir, reenvía SÓLO lo que el servidor no tiene', async () => {
    fetchRoundHoleScores.mockResolvedValue([{ hole_number: 7, gross_score: 5 }])
    dejarPendiente({ 7: 5, 8: 4 })
    const { result } = await montar()
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    expect(enviados).toEqual([{ hole: 8, gross: 4 }])
    expect(respaldo()).toBeNull()
  })

  it('al volver a abrir la tarjeta con cola pendiente, la reenvía UNA vez y la confirma', async () => {
    dejarPendiente({ 7: 5, 8: 4 })
    const { result, rerender } = await montar()
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    expect(enviados).toEqual([{ hole: 7, gross: 5 }, { hole: 8, gross: 4 }])
    expect(respaldo()).toBeNull()
    // Nueva identidad del jugador (el roster se recargó): no vuelve a mandar nada.
    rerender(args({ player: { ...jugador } as ScoringPlayer }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(enviados).toHaveLength(2)
  })

  it('reenvío al abrir que vuelve a recibir 401: aviso sin acceso que la carga no pisa con "error"', async () => {
    dejarPendiente({ 7: 5 })
    respuestas = [{ status: 401 }]
    const { result } = await montar()
    await waitFor(() => expect(result.current.saveStatus).toBe('sin_acceso'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(result.current.saveStatus).toBe('sin_acceso')
    expect(respaldo()).toEqual({ 7: 5 })
  })
})

describe('useGuardadoTorneo — la cola no se confirma con hoyos sin llegar ni se reenvía entera', () => {
  it('hoyo 3 falla (5xx) y el 4 entra: se reenvía SÓLO el 3, y la cola queda confirmada', async () => {
    respuestas = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 200 }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(3, '5') })
    expect(respaldo()).toEqual({ 3: 5 })
    await act(async () => { await result.current.guardarHoyo(4, '4') })
    await waitFor(() => expect(respaldo()).toBeNull())
    expect(enviados.filter(e => e.hole === 3)).toHaveLength(4)
    expect(enviados.filter(e => e.hole === 4)).toHaveLength(1)
  })

  it('anotar rápido (dos blur solapados): un POST por hoyo, sin reenvíos ni toast "Sincronizado"', async () => {
    const { result } = await montar()
    let soltar!: () => void
    colgar = new Promise<void>(r => { soltar = r })
    let primero!: Promise<void>
    act(() => { primero = result.current.guardarHoyo(1, '4') })
    await act(async () => { await result.current.guardarHoyo(2, '5') })
    await act(async () => { soltar(); await primero })
    for (let h = 3; h <= 9; h++) await act(async () => { await result.current.guardarHoyo(h, '4') })
    expect(fetchMock).toHaveBeenCalledTimes(9)
    expect(respaldo()).toBeNull()
    expect(addToast).not.toHaveBeenCalled()
  })

  it('un reenvío colgado de la tarjeta anterior no bloquea el de la nueva', async () => {
    dejarPendiente({ 7: 5 })
    let soltar!: () => void
    colgar = new Promise<void>(r => { soltar = r })
    const { rerender } = await montar()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // Otra tarjeta con su propia cola, mientras la anterior sigue colgada.
    localStorage.setItem(claveDelRespaldo(SLUG, 'ronda-2'), JSON.stringify({ scores: { 2: 6 }, timestamp: Date.now(), sincronizado: false, codigoRonda: SLUG, jugadorId: 'ronda-2' }))
    const otro = { id: 'p2', rounds: [{ id: 'ronda-2' }] } as unknown as ScoringPlayer
    rerender(args({ player: otro, roundId: 'ronda-2' }))
    await waitFor(() => expect(enviados).toContainEqual({ hole: 2, gross: 6 }))
    await act(async () => { soltar() })
  })

  it('(a) corrección de un hoyo ya confirmado (5: 4→5) que falla: queda en cola y se reenvía', async () => {
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(5, '4') })
    respuestas = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 200 }]
    await act(async () => { await result.current.guardarHoyo(5, '5') })
    expect(result.current.saveStatus).toBe('error')
    expect(respaldo()).toEqual({ 5: 5 })
    await act(async () => { await result.current.guardarHoyo(6, '4') })
    await waitFor(() => expect(respaldo()).toBeNull())
    expect(enviados.at(-1)).toEqual({ hole: 5, gross: 5 })
  })

  it('(b) reintento viejo (5=4, 503) que entra después del ok de la corrección (5=5): se reenvía el 5', async () => {
    const { result } = await montar()
    respuestas = [{ status: 503 }, { status: 200 }]
    let viejo!: Promise<void>
    act(() => { viejo = result.current.guardarHoyo(5, '4') })
    await waitFor(() => expect(enviados).toHaveLength(1))
    await act(async () => { await result.current.guardarHoyo(5, '5') })
    expect(respaldo()).toBeNull()
    // El reintento del 4 entra después: el servidor quedó con el valor viejo.
    await act(async () => { vi.advanceTimersByTime(500); await viejo })
    await waitFor(() => expect(enviados.at(-1)).toEqual({ hole: 5, gross: 5 }))
    expect(enviados.map(e => e.gross)).toEqual([4, 5, 4, 5])
    await waitFor(() => expect(respaldo()).toBeNull())
  })

  it('(c) hoyo en vuelo que falla después del ok de otro: error y la cola se conserva', async () => {
    const { result } = await montar()
    let soltar!: () => void
    colgar = new Promise<void>(r => { soltar = r })
    respuestas = [{ status: 200 }, { status: 500 }]
    let primero!: Promise<void>
    act(() => { primero = result.current.guardarHoyo(1, '4') })
    await waitFor(() => expect(enviados).toHaveLength(1))
    await act(async () => { await result.current.guardarHoyo(2, '5') })
    // El ok del 2 no reenvía el 1 (va en camino) ni da la cola por enviada.
    expect(enviados).toHaveLength(2)
    expect(respaldo()).toEqual({ 1: 4, 2: 5 })
    await act(async () => { soltar(); vi.advanceTimersByTime(2000); await primero })
    expect(result.current.saveStatus).toBe('error')
    expect(respaldo()).toEqual({ 1: 4, 2: 5 })
  })

  it('guardar antes de que termine la carga no reenvía la tarjeta entera', async () => {
    let cargar!: (v: unknown) => void
    fetchRoundHoleScores.mockReturnValue(new Promise(r => { cargar = r }))
    dejarPendiente({ 1: 4, 2: 5, 3: 4 })
    const { result } = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args() })
    await act(async () => { await result.current.guardarHoyo(4, '4') })
    expect(enviados).toEqual([{ hole: 4, gross: 4 }])
    // Al terminar la carga, el reenvío al abrir manda SÓLO lo que el servidor no tiene.
    await act(async () => { cargar([{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 5 }]) })
    await waitFor(() => expect(respaldo()).toBeNull())
    expect(enviados.slice(1)).toEqual([{ hole: 3, gross: 4 }])
  })

  it('A → "Cambiar jugador" → A sin recargar: vuelve a reenviar al abrir', async () => {
    respuestas = [{ status: 401 }]
    const { result, rerender } = await montar()
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(respaldo()).toEqual({ 7: 5 })
    respuestas = [{ status: 200 }]
    rerender(args({ player: undefined, roundId: null }))
    await act(async () => {})
    rerender(args())
    await waitFor(() => expect(respaldo()).toBeNull())
    expect(enviados).toEqual([{ hole: 7, gross: 5 }, { hole: 7, gross: 5 }])
  })

  it('ronda cerrada en el reenvío de una tarjeta que ya no está abierta: descarta sin avisos', async () => {
    dejarPendiente({ 7: 5 })
    respuestas = [{ status: 409, body: { code: 'round_closed' } }]
    let soltar!: () => void
    colgar = new Promise<void>(r => { soltar = r })
    const onRondaCerrada = vi.fn()
    const { rerender } = await montar({ onRondaCerrada })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const otro = { id: 'p2', rounds: [{ id: 'ronda-2' }] } as unknown as ScoringPlayer
    rerender(args({ onRondaCerrada, player: otro, roundId: 'ronda-2' }))
    await act(async () => { soltar() })
    await waitFor(() => expect(respaldo()).toBeNull())
    expect(onRondaCerrada).not.toHaveBeenCalled()
    expect(addToast).not.toHaveBeenCalled()
  })
})
