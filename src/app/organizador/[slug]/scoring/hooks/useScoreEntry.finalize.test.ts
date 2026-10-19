// "Finalizar" del scorer del organizador: si /api/game no cierra la tarjeta
// (503 transitorio, 404, sin señal), el organizador tiene que enterarse y la
// tarjeta seguir seleccionada. Antes la respuesta no se miraba y el botón
// "no hacía nada" (#517).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: vi.fn(async () => []),
  fetchRoundTotals: vi.fn(async () => null),
}))
const showError = vi.fn()
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError, showSuccess: vi.fn(), showWarning: vi.fn() }),
}))

const ROUND = { id: 'r1', status: 'in_progress', total_gross: 0, total_net: 0, total_points: 0, round_number: 1 } as ScoringRound
const PLAYER = { id: 'p1' } as ScoringPlayer
const reloadRoster = vi.fn(async () => {})
// Referencias estables: el hook las usa como dependencias de efectos.
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [PLAYER]
const VACIO: never[] = []
const getActiveRound = () => ROUND
const applyRoundTotals = vi.fn()

function montar() {
  return renderHook(() =>
    useScoreEntry({
      tournament: TOURNAMENT,
      players: PLAYERS,
      courseHoles: VACIO,
      courseTees: VACIO,
      holeCount: 18,
      getActiveRound,
      applyRoundTotals,
      reloadRoster,
    }),
  )
}

beforeEach(() => {
  showError.mockClear()
  reloadRoster.mockClear()
})

describe('useScoreEntry · finalizeRound', () => {
  it('si el servidor no cierra la tarjeta (503), avisa y deja la tarjeta seleccionada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    const { result } = montar()
    act(() => result.current.selectPlayer('p1'))
    await act(() => result.current.finalizeRound())
    expect(showError).toHaveBeenCalledWith('No se cerró la tarjeta', 'Intenta de nuevo.')
    expect(result.current.selectedId).toBe('p1')
    expect(reloadRoster).not.toHaveBeenCalled()
  })

  it('sin señal (fetch rechaza), avisa igual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { result } = montar()
    act(() => result.current.selectPlayer('p1'))
    await act(() => result.current.finalizeRound())
    expect(showError).toHaveBeenCalledTimes(1)
    expect(result.current.selectedId).toBe('p1')
  })

  it('cierre exitoso: recarga el roster y limpia la selección, sin error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const { result } = montar()
    act(() => result.current.selectPlayer('p1'))
    await act(() => result.current.finalizeRound())
    await waitFor(() => expect(result.current.selectedId).toBeNull())
    expect(reloadRoster).toHaveBeenCalledTimes(1)
    expect(showError).not.toHaveBeenCalled()
  })
})
