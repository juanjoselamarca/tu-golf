// Scorer del organizador con un jugador SIN tarjeta en la ronda en juego: el golpe no tiene dónde guardarse.
// Antes `saveScore` hacía `if (!round) return`: el organizador anotaba y el golpe se perdía sin aviso.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: vi.fn(async () => []),
  fetchRoundTotals: vi.fn(async () => ({ total_gross: 0, total_net: 0, total_points: 0 })),
}))
const showWarning = vi.fn()
// Referencias estables, como el useToast real: con un objeto nuevo por render los useCallback del hook
// cambian en cada render y el efecto de carga entra en bucle.
const toast = { showError: vi.fn(), showSuccess: vi.fn(), showWarning }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'p1', player_name: 'Rosa Pérez', profiles: null, rounds: [] }] as unknown as ScoringPlayer[]
const VACIO: never[] = []
const sinRonda = () => undefined
const applyRoundTotals = vi.fn()
const reloadRoster = vi.fn(async () => {})

describe('useScoreEntry — jugador sin tarjeta', () => {
  beforeEach(() => { showWarning.mockReset(); captureError.mockReset(); vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('no llama al servidor, avisa que el golpe no se guardó y lo reporta', async () => {
    const { result } = renderHook(() => useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound: sinRonda, applyRoundTotals, reloadRoster,
    }))
    await act(async () => result.current.selectPlayer('p1'))
    await act(async () => { await result.current.saveScore(3, '5') })

    expect(fetch).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalledTimes(1)
    const [titulo, detalle] = showWarning.mock.calls[0]
    expect(titulo).toBe('No se guardó')
    expect(detalle).toContain('Rosa Pérez no tiene tarjeta en esta ronda')
    expect(detalle).toContain('Crear su tarjeta')
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'organizador.score.sinTarjeta' }))
    expect(result.current.currentScores[3]).toBeUndefined()
  })
})
