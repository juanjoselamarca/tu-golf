// Revisión Fable #834 v3 (P0 de contexto): el `useToast` real devuelve funciones nuevas en cada render. Si la carga
// de la tarjeta dependiera de la identidad de `showError`, cada render crearía una carga nueva y el efecto entraría
// en bucle (consultas sin fin a `hole_scores`, la tarjeta nunca "lista"). Acá el toast es inestable a propósito.

import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundHoleScores = vi.fn(async () => [{ hole_number: 1, gross_score: 4, putts: 2, fairway_hit: null, gir: null }])
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: () => fetchRoundHoleScores(),
  fetchRoundTotals: async () => null,
}))
// Objeto y funciones NUEVOS en cada render, como hoy el hook real.
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn() }),
}))

const RONDA = { id: 'r1', status: 'in_progress', round_number: 1 } as ScoringRound
const PLAYERS = [{ id: 'p1' }] as ScoringPlayer[]
const VACIO: never[] = []
const getActiveRound = (p: ScoringPlayer | undefined) => (p ? RONDA : undefined)

describe('useScoreEntry · con un useToast de identidad inestable', () => {
  it('abrir la tarjeta hace una sola consulta y llega a "lista" (sin bucle de cargas)', async () => {
    const { result } = renderHook(() =>
      useScoreEntry({
        tournament: { id: 't1' } as ScoringTournament, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO,
        holeCount: 18, getActiveRound, applyRoundTotals: vi.fn(), reloadRoster: vi.fn(async () => {}),
      }),
    )
    await act(async () => result.current.selectPlayer('p1'))
    // Varios renders más (cada uno con otro showError): no deben pedir la tarjeta de nuevo.
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() })
    expect(result.current.cargaTarjeta).toBe('lista')
    expect(result.current.currentScores[1]).toBe(4)
    expect(fetchRoundHoleScores).toHaveBeenCalledTimes(1)
  })
})
