import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))
const fetchRoundHoleScores = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (...a: unknown[]) => fetchRoundHoleScores(...a),
}))

import { useGuardadoTorneo, type UseGuardadoTorneoArgs } from './useGuardadoTorneo'
import { claveDelRespaldo, leerRespaldoPendiente } from '@/lib/ronda/respaldo-local'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { CourseHole } from '@/golf/leaderboard/types'

// #754 P2-a: al pasar de la ronda 1 a la 2 (mismo jugador, otra tarjeta), los golpes de la ronda 1
// seguían en pantalla hasta que terminaba la carga de la 2, y un hoyo anotado en ese lapso los copiaba
// al respaldo de la ronda 2 (y de ahí al servidor).

const SLUG = 'copa-test'
const torneo = { id: 't1', formato_juego: 'stroke_play', modo_juego: 'gross' } as unknown as ScoringTournament
const jugador = { id: 'p1', rounds: [{ id: 'ronda-1' }, { id: 'ronda-2' }] } as unknown as ScoringPlayer
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, handicap: i + 1 })) as unknown as CourseHole[]

function args(extra: Partial<UseGuardadoTorneoArgs> = {}): UseGuardadoTorneoArgs {
  return {
    slug: SLUG, tournament: torneo, player: jugador, roundId: 'ronda-1', contextoListo: true,
    hoyosRonda: hoyos, holeCount: 18, courseHcpDe: () => 0, bloqueado: false,
    guestId: null, guestToken: null, onRondaCerrada: vi.fn(), onInvitadoCompleto: vi.fn(),
    ...extra,
  }
}

beforeEach(() => {
  localStorage.clear()
  fetchRoundHoleScores.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useGuardadoTorneo — cambio de ronda', () => {
  it('la tarjeta de la ronda 2 parte vacía (nunca con los golpes de la 1) y lo pendiente de la 1 se conserva', async () => {
    fetchRoundHoleScores.mockResolvedValueOnce([{ hole_number: 1, gross_score: 4 }, { hole_number: 2, gross_score: 5 }])
    const pendienteR1 = { 7: 6 }
    localStorage.setItem(claveDelRespaldo(SLUG, 'ronda-1'), JSON.stringify({ scores: pendienteR1, timestamp: Date.now(), sincronizado: false, codigoRonda: SLUG, jugadorId: 'ronda-1' }))
    const h = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args() })
    await waitFor(() => expect(h.result.current.currentScores).toEqual({ 1: 4, 2: 5, 7: 6 }))

    // La carga de la ronda 2 queda colgada: es el lapso en que se veían los golpes de la 1.
    let soltar: (v: unknown[]) => void = () => {}
    fetchRoundHoleScores.mockReturnValueOnce(new Promise(r => { soltar = r }))
    h.rerender(args({ roundId: 'ronda-2' }))
    expect(h.result.current.currentScores).toEqual({})

    // Un hoyo anotado antes de que termine la carga va SOLO a la ronda 2.
    await act(async () => { await h.result.current.guardarHoyo(3, '5') })
    expect(leerRespaldoPendiente(SLUG, 'ronda-2')).toEqual({ 3: 5 })
    expect(h.result.current.currentScores).toEqual({ 3: 5 })

    await act(async () => { soltar([]) })
    expect(h.result.current.currentScores).toEqual({ 3: 5 })
    // Lo que la ronda 1 no alcanzó a subir sigue en el teléfono para su reenvío.
    expect(leerRespaldoPendiente(SLUG, 'ronda-1')).toEqual(pendienteR1)
  })
})
