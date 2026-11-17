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
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as { hole_number: number; gross_score: number }
  enviados.push({ hole: body.hole_number, gross: body.gross_score })
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
  return h
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  respuestas = [{ status: 200 }]
  enviados.length = 0
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

  it('403 de invitado: salida a reinscribirse', async () => {
    respuestas = [{ status: 403 }]
    const { result } = await montar({ guestId: 'g1', guestToken: 'tok' })
    await act(async () => { await result.current.guardarHoyo(7, '5') })
    expect(result.current.sinAcceso?.href).toBe(`/torneo/${SLUG}/unirse`)
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

describe('useGuardadoTorneo — la cola no se confirma con hoyos sin llegar', () => {
  it('hoyo 3 falla (5xx) y el 4 entra: el 3 se reenvía, no queda marcado como enviado', async () => {
    respuestas = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 200 }]
    const { result } = await montar()
    await act(async () => { await result.current.guardarHoyo(3, '5') })
    expect(respaldo()).toEqual({ 3: 5 })
    await act(async () => { await result.current.guardarHoyo(4, '4') })
    await waitFor(() => expect(respaldo()).toBeNull())
    expect(enviados.filter(e => e.hole === 3).length).toBeGreaterThanOrEqual(4)
  })
})
