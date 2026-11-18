import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
const fetchRoundHoleScores = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (...a: unknown[]) => fetchRoundHoleScores(...a),
}))

import { useGuardadoTorneo, type UseGuardadoTorneoArgs } from './useGuardadoTorneo'
import { claveDelRespaldo } from '@/lib/ronda/respaldo-local'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { CourseHole } from '@/golf/leaderboard/types'

// Fable #833 v2/v3 P1: con el acceso de invitado recuperado en el scorer, el aviso se apaga y la cola que quedó
// en el teléfono se reenvía, sin recargar. La recuperación es EXPLÍCITA (`accesoRecuperado`): el token
// reemitido suele ser el mismo string, y una respuesta vieja que vuelve después no re-enciende el aviso.

const SLUG = 'copa-test'
const torneo = { id: 't1', formato_juego: 'stroke_play', modo_juego: 'gross' } as unknown as ScoringTournament
const jugador = { id: 'p1', rounds: [{ id: 'ronda-1' }] } as unknown as ScoringPlayer
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, handicap: i + 1 })) as unknown as CourseHole[]
const GUEST = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'tok-del-jugador'

function args(extra: Partial<UseGuardadoTorneoArgs> = {}): UseGuardadoTorneoArgs {
  return {
    slug: SLUG, tournament: torneo, player: jugador, roundId: 'ronda-1', contextoListo: true,
    hoyosRonda: hoyos, holeCount: 18, courseHcpDe: () => 0, bloqueado: false,
    guestId: GUEST, guestToken: TOKEN, onRondaCerrada: vi.fn(), onInvitadoCompleto: vi.fn(),
    ...extra,
  }
}

type Init = RequestInit | undefined
const tokenDe = (init: Init) => (init?.headers as Record<string, string> | undefined)?.['x-guest-token']
const hoyoDe = (init: Init) => JSON.parse(String(init?.body)).hole_number as number
const respuesta = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body })

/** El servidor acepta el token sólo cuando `acepta` es true (antes de recuperar, el acceso está cortado). */
let acepta = false
/** Hoyos cuya respuesta se retiene hasta soltarla (un envío "en vuelo"). */
const retenidos = new Map<number, () => void>()
let retener: number | null = null
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  const token = tokenDe(init)
  const decision = !token ? respuesta(401, {}) : acepta ? respuesta(200, { ok: true }) : respuesta(403, { code: 'guest_token_invalid' })
  if (retener !== null && hoyoDe(init) === retener) {
    retener = null
    await new Promise<void>(r => retenidos.set(hoyoDe(init), r))
  }
  return decision
})
/** Envíos que el servidor aceptó, por hoyo. */
const aceptadosPorHoyo = async () => {
  const resultados = await Promise.all(fetchMock.mock.results.map(r => r.value))
  const conteo: Record<number, number> = {}
  fetchMock.mock.calls.forEach(([, init], i) => {
    if (resultados[i].status === 200) conteo[hoyoDe(init)] = (conteo[hoyoDe(init)] ?? 0) + 1
  })
  return conteo
}

const conCola = (scores: Record<number, number>) =>
  localStorage.setItem(claveDelRespaldo(SLUG, 'ronda-1'), JSON.stringify({ scores, timestamp: Date.now(), sincronizado: false, codigoRonda: SLUG, jugadorId: 'ronda-1' }))

beforeEach(() => {
  localStorage.clear()
  acepta = false
  retener = null
  retenidos.clear()
  fetchRoundHoleScores.mockReset().mockResolvedValue([])
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useGuardadoTorneo — acceso de invitado recuperado', () => {
  it('acceso cortado → aviso; recuperado (mismo token) → aviso apagado y CADA hoyo de la cola se envía una vez', async () => {
    conCola({ 1: 4, 2: 5 })
    const h = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args() })
    await waitFor(() => expect(h.result.current.sinAcceso).not.toBeNull())

    acepta = true
    act(() => h.result.current.accesoRecuperado(TOKEN))
    await waitFor(() => expect(h.result.current.saveStatus).toBe('saved'))
    expect(h.result.current.sinAcceso).toBeNull()
    expect(await aceptadosPorHoyo()).toEqual({ 1: 1, 2: 1 })
  })

  it('hoyo en vuelo con el acceso viejo que responde DESPUÉS de recuperar: no re-enciende el aviso y se envía', async () => {
    const h = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args() })
    await waitFor(() => expect(fetchRoundHoleScores).toHaveBeenCalled())
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    // Hoyo 3 sale con el acceso cortado y queda viajando; el 2 ya dejó el aviso encendido.
    await act(async () => { await h.result.current.guardarHoyo(2, '5') })
    expect(h.result.current.sinAcceso).not.toBeNull()
    retener = 3
    let guardado3: Promise<void> = Promise.resolve()
    act(() => { guardado3 = h.result.current.guardarHoyo(3, '4') })
    await waitFor(() => expect(retenidos.has(3)).toBe(true))

    // "Recuperar" vuelve antes que la respuesta del hoyo 3.
    acepta = true
    act(() => h.result.current.accesoRecuperado(TOKEN))
    await waitFor(() => expect(h.result.current.sinAcceso).toBeNull())
    // Llega la respuesta vieja (403 del acceso cortado).
    await act(async () => { retenidos.get(3)!(); await guardado3 })

    expect(h.result.current.sinAcceso).toBeNull()
    await waitFor(async () => expect(await aceptadosPorHoyo()).toEqual({ 2: 1, 3: 1 }))
  })

  it('segunda recuperación con el MISMO token: vuelve a destrabar (no depende de que cambie el valor)', async () => {
    conCola({ 1: 4 })
    const h = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args() })
    await waitFor(() => expect(h.result.current.sinAcceso).not.toBeNull())

    // Primera recuperación: el servidor todavía rechaza (p. ej. no propagó): el aviso vuelve.
    act(() => h.result.current.accesoRecuperado(TOKEN))
    await waitFor(() => expect(h.result.current.sinAcceso).not.toBeNull())

    acepta = true
    act(() => h.result.current.accesoRecuperado(TOKEN))
    await waitFor(() => expect(h.result.current.sinAcceso).toBeNull())
    await waitFor(async () => expect(await aceptadosPorHoyo()).toEqual({ 1: 1 }))
  })
})
