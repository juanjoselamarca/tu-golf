// Scorer del organizador con un jugador SIN tarjeta en la ronda en juego: el golpe no tiene dónde guardarse.
// Antes `saveScore` hacía `if (!round) return`: el organizador anotaba y el golpe se perdía sin aviso.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import { tarjetaDeLaRonda } from '@/golf/tournament-rounds'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: vi.fn(async () => []),
  fetchRoundTotals: vi.fn(async () => ({ total_gross: 0, total_net: 0, total_points: 0 })),
}))
const showWarning = vi.fn()
// Referencias fijas para poder mirar las llamadas. OJO: el `useToast` real hoy devuelve funciones nuevas en cada
// render (se arregla aparte, `fix/toast-estable-claude`); que eso no meta la carga en bucle lo cubre
// `useScoreEntry.toastInestable.test.ts`.
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

  // Roster real: retirado con la tarjeta de la ronda 1 (abierta: retirar no la cierra) y sin la de la ronda 2,
  // con la ronda 2 en juego. Antes `getActiveRound` caía a `rounds[0]`: el organizador veía y editaba la tarjeta
  // de la ronda 1, y "Finalizar" la cerraba desde la pantalla de la ronda 2.
  it('ronda 2 en juego y jugador con solo la tarjeta de la 1: ni guarda ni cierra la de la ronda 1', async () => {
    const roster = [{ id: 'p1', status: 'withdrawn', player_name: 'Rosa Pérez', profiles: null,
      rounds: [{ id: 'r1', round_number: 1, status: 'in_progress', total_gross: null, total_net: null, total_points: null }] }] as unknown as ScoringPlayer[]
    const getActiveRound = (p: ScoringPlayer | undefined) => tarjetaDeLaRonda(p?.rounds, 2)
    const { result } = renderHook(() => useScoreEntry({
      tournament: TOURNAMENT, players: roster, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals, reloadRoster,
    }))
    await act(async () => result.current.selectPlayer('p1'))
    expect(result.current.selectedRound).toBeUndefined()
    await act(async () => { await result.current.saveScore(1, '4') })
    await act(async () => { await result.current.finalizeRound() })
    expect(fetch).not.toHaveBeenCalled()
  })
})
