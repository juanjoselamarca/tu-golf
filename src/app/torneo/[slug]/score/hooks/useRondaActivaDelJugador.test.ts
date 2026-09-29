// El scorer del jugador escribe en la ronda ACTIVA con la cancha de ESA ronda.
// Acá se fija el hook: elige la tarjeta abierta de mayor número, resuelve su
// contexto por la fuente única compartida con el organizador, cachea por
// número de ronda y expone error + reintento sin scorear a ciegas.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundScoringContext = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundScoringContext: (...args: unknown[]) => fetchRoundScoringContext(...args),
}))

import { useRondaActivaDelJugador } from './useRondaActivaDelJugador'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'

const TOURNAMENT = { id: 't1', course_id: 'A', hole_count: 18, total_rounds: 2 } as unknown as ScoringTournament
const BASE = { holes: [], tees: [] }
const round = (round_number: number, status: string) =>
  ({ id: `r${round_number}`, status, round_number, total_gross: 0, total_net: 0, total_points: 0 })
const player = (rounds: ReturnType<typeof round>[]) =>
  ({ id: 'p1', rounds } as unknown as ScoringPlayer)

beforeEach(() => {
  fetchRoundScoringContext.mockReset()
  fetchRoundScoringContext.mockImplementation(async (_c: unknown, _t: unknown, n: number) => ({
    roundNumber: n, holeCount: 18, courseHoles: [], parTotal: 72, courseTees: [], tournament: TOURNAMENT,
  }))
})

describe('useRondaActivaDelJugador', () => {
  it('con la ronda 1 cerrada y la 2 abierta, la activa es la 2 y se resuelve SU cancha', async () => {
    const { result } = renderHook(() =>
      useRondaActivaDelJugador({ slug: 's', tournament: TOURNAMENT, player: player([round(1, 'closed'), round(2, 'in_progress')]), base: BASE }),
    )
    expect(result.current.round?.id).toBe('r2')
    await waitFor(() => expect(result.current.ctx?.roundNumber).toBe(2))
    expect(fetchRoundScoringContext).toHaveBeenCalledWith({}, TOURNAMENT, 2, BASE)
  })

  it('sin jugador → sin ronda ni contexto, y no consulta', () => {
    const { result } = renderHook(() =>
      useRondaActivaDelJugador({ slug: 's', tournament: TOURNAMENT, player: undefined, base: BASE }),
    )
    expect(result.current.round).toBeUndefined()
    expect(result.current.ctx).toBeNull()
    expect(fetchRoundScoringContext).not.toHaveBeenCalled()
  })

  it('cachea por número de ronda: cambiar de jugador en la misma ronda no vuelve a la BD', async () => {
    const p1 = player([round(1, 'in_progress')])
    const p2 = { ...player([round(1, 'in_progress')]), id: 'p2' } as unknown as ScoringPlayer
    const { result, rerender } = renderHook(
      ({ player: p }) => useRondaActivaDelJugador({ slug: 's', tournament: TOURNAMENT, player: p, base: BASE }),
      { initialProps: { player: p1 } },
    )
    await waitFor(() => expect(result.current.ctx?.roundNumber).toBe(1))
    rerender({ player: p2 })
    await waitFor(() => expect(result.current.ctx?.roundNumber).toBe(1))
    expect(fetchRoundScoringContext).toHaveBeenCalledTimes(1)
  })

  it('si falla la carga: ctx null + error, y `retry` vuelve a intentar', async () => {
    fetchRoundScoringContext.mockRejectedValueOnce(new Error('boom'))
    const p = player([round(1, 'in_progress')])
    const { result } = renderHook(() =>
      useRondaActivaDelJugador({ slug: 's', tournament: TOURNAMENT, player: p, base: BASE }),
    )
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.ctx).toBeNull()
    expect(fetchRoundScoringContext).toHaveBeenCalledTimes(1)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.ctx?.roundNumber).toBe(1))
    expect(result.current.error).toBe(false)
    expect(fetchRoundScoringContext).toHaveBeenCalledTimes(2)
  })

  it('un objeto `player` nuevo con el MISMO id (recarga del roster) no refetchea', async () => {
    const { result, rerender } = renderHook(
      ({ p }) => useRondaActivaDelJugador({ slug: 's', tournament: TOURNAMENT, player: p, base: BASE }),
      { initialProps: { p: player([round(1, 'in_progress')]) } },
    )
    await waitFor(() => expect(result.current.ctx?.roundNumber).toBe(1))
    rerender({ p: player([round(1, 'in_progress')]) })
    rerender({ p: player([round(1, 'in_progress')]) })
    expect(fetchRoundScoringContext).toHaveBeenCalledTimes(1)
  })
})
