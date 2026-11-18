// Con el useToast REAL (sin mock): `showError` cambiaba de referencia en cada render, `loadScores` dependía de él
// y el efecto [selectedId, loadScores] volvía a consultar la tarjeta tras cada respuesta. Con un jugador abierto,
// el scorer del organizador consultaba Supabase en bucle mientras la pantalla siguiera abierta.

import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import { fetchRoundHoleScores } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  // Cada respuesta trae filas nuevas (objetos distintos), como la base real.
  fetchRoundHoleScores: vi.fn(async () => [{ hole_number: 1, gross_score: 4, putts: 2, fairway_hit: true, gir: true }]),
  fetchRoundTotals: vi.fn(async () => ({ total_gross: 4, total_net: 4, total_points: 2 })),
}))

const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'p1', player_name: 'Rosa Pérez', profiles: null,
  rounds: [{ id: 'r1', round_number: 1, status: 'in_progress', total_gross: null, total_net: null, total_points: null }] }] as unknown as ScoringPlayer[]
const VACIO: never[] = []
const getActiveRound = (p: ScoringPlayer | undefined) => p?.rounds?.[0]
const applyRoundTotals = vi.fn()
const reloadRoster = vi.fn(async () => {})

describe('useScoreEntry — la carga de la tarjeta no entra en bucle', () => {
  it('abrir un jugador consulta su tarjeta una vez, aunque pasen varios renders', async () => {
    const { result } = renderHook(() => useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals, reloadRoster,
    }))
    await act(async () => result.current.selectPlayer('p1'))
    // Dar tiempo a que, si hubiera bucle, se encadenen varias consultas.
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    expect(result.current.currentScores[1]).toBe(4)
    expect(vi.mocked(fetchRoundHoleScores)).toHaveBeenCalledTimes(1)
  })
})
