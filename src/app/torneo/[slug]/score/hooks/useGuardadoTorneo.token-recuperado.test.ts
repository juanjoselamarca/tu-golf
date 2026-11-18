import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

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

// Fable #833 v2 P1: con el token de invitado recuperado en el scorer, el aviso se apaga y la cola que quedó
// en el teléfono se reenvía con el token nuevo, sin recargar la pantalla.

const SLUG = 'copa-test'
const torneo = { id: 't1', formato_juego: 'stroke_play', modo_juego: 'gross' } as unknown as ScoringTournament
const jugador = { id: 'p1', rounds: [{ id: 'ronda-1' }] } as unknown as ScoringPlayer
const hoyos = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, handicap: i + 1 })) as unknown as CourseHole[]
const GUEST = '22222222-2222-4222-8222-222222222222'

function args(extra: Partial<UseGuardadoTorneoArgs> = {}): UseGuardadoTorneoArgs {
  return {
    slug: SLUG, tournament: torneo, player: jugador, roundId: 'ronda-1', contextoListo: true,
    hoyosRonda: hoyos, holeCount: 18, courseHcpDe: () => 0, bloqueado: false,
    guestId: GUEST, guestToken: 'tok-viejo', onRondaCerrada: vi.fn(), onInvitadoCompleto: vi.fn(),
    ...extra,
  }
}

const tokenDe = (init: RequestInit | undefined) => (init?.headers as Record<string, string> | undefined)?.['x-guest-token']
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  const token = tokenDe(init)
  if (token === 'tok-nuevo') return { ok: true, status: 200, json: async () => ({ ok: true }) }
  if (token) return { ok: false, status: 403, json: async () => ({ code: 'guest_token_invalid' }) }
  return { ok: false, status: 401, json: async () => ({}) }
})

beforeEach(() => {
  localStorage.clear()
  fetchRoundHoleScores.mockReset().mockResolvedValue([])
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('useGuardadoTorneo — token de invitado recuperado', () => {
  it('token roto → aviso de acceso; token nuevo → aviso apagado y la cola se reenvía con él', async () => {
    localStorage.setItem(claveDelRespaldo(SLUG, 'ronda-1'), JSON.stringify({ scores: { 1: 4, 2: 5 }, timestamp: Date.now(), sincronizado: false, codigoRonda: SLUG, jugadorId: 'ronda-1' }))
    const h = renderHook((p: UseGuardadoTorneoArgs) => useGuardadoTorneo(p), { initialProps: args() })
    await waitFor(() => expect(h.result.current.sinAcceso).not.toBeNull())

    h.rerender(args({ guestToken: 'tok-nuevo' }))
    await waitFor(() => expect(h.result.current.sinAcceso).toBeNull())
    await waitFor(() => {
      const hoyosConNuevo = fetchMock.mock.calls
        .filter(([, i]) => tokenDe(i) === 'tok-nuevo')
        .map(([, i]) => JSON.parse(String(i?.body)).hole_number)
      expect(new Set(hoyosConNuevo)).toEqual(new Set([1, 2]))
    })
  })
})
