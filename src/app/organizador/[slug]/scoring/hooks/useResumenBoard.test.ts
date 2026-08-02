// Tests del hook del board del Resumen: fetch sólo cuando el tab está activo,
// board construido por el MOTOR (no por columnas denormalizadas), reload
// explícito, y error visible (no board vacío).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useResumenBoard } from './useResumenBoard'
import type { ScoringTournament } from '@/lib/data/tournaments/scoring'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { DBPlayer } from '@/app/torneo/[slug]/types'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

const fetchResumenBoardInputs = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchResumenBoardInputs: (...args: unknown[]) => fetchResumenBoardInputs(...args),
}))

const COURSE_HOLES: CourseHole[] = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

const TOURNAMENT: ScoringTournament = {
  id: 't1',
  name: 'Copa Test',
  slug: 'copa-test',
  format: 'stroke_play',
  modo_juego: 'neto',
  formato_juego: 'stroke_play',
  hole_count: 18,
  total_rounds: 1,
  tees: null,
  hcp_calc_mode: null,
  courses: { id: 'c1', nombre: 'Cancha', par_total: 72, slope_rating: 113, course_rating: 72 },
}

/** Tarjeta completa cerrada, con total_net=0 (la forma real de prod). */
function jugadorCerrado(id: string, nombre: string, grossPorHoyo: number, hcp: number): DBPlayer {
  return {
    id,
    handicap_at_registration: hcp,
    player_name: null,
    profiles: { name: nombre, indice: hcp },
    categories: null,
    rounds: [
      {
        id: `r-${id}`,
        status: 'closed',
        total_gross: grossPorHoyo * 18,
        total_net: 0,
        total_points: 0,
        round_number: 1,
        hole_scores: COURSE_HOLES.map((h) => ({ hole_number: h.numero, gross_score: grossPorHoyo })),
      },
    ],
  }
}

beforeEach(() => {
  fetchResumenBoardInputs.mockReset()
  fetchResumenBoardInputs.mockResolvedValue({
    dbPlayers: [jugadorCerrado('a', 'Ana Silva', 5, 10), jugadorCerrado('b', 'Beto Rojas', 6, 2)],
    hcp: { mode: null, tees: null, course: null, courseTees: [] },
  })
})

describe('useResumenBoard', () => {
  it('NO fetchea mientras el tab no está activo', () => {
    renderHook(() =>
      useResumenBoard({ tournament: TOURNAMENT, courseHoles: COURSE_HOLES, active: false }),
    )
    expect(fetchResumenBoardInputs).not.toHaveBeenCalled()
  })

  it('al activarse arma el board con el motor: completos y mejor neto correctos con total_net=0', async () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useResumenBoard({ tournament: TOURNAMENT, courseHoles: COURSE_HOLES, active }),
      { initialProps: { active: false } },
    )
    rerender({ active: true })

    await waitFor(() => expect(result.current.cards).not.toBeNull())
    // Con la lógica vieja: completos=0 ('completed' no existe) y mejorNeto='--'
    // (guard n!==0 sobre la columna). Con el motor:
    expect(result.current.cards?.completos).toBe(2)
    expect(result.current.cards?.mejorNeto).toEqual({ name: 'Ana Silva', score: 5 * 18 - 10 })
    expect(result.current.cards?.mejorGross).toEqual({ name: 'Ana Silva', score: 5 * 18 })
    // Filas en el orden del ranking del board público.
    expect(result.current.rows.map((r) => r.name)).toEqual(['Ana Silva', 'Beto Rojas'])
  })

  it('reload() vuelve a consultar (post-edición de handicap)', async () => {
    const { result } = renderHook(() =>
      useResumenBoard({ tournament: TOURNAMENT, courseHoles: COURSE_HOLES, active: true }),
    )
    await waitFor(() => expect(result.current.cards).not.toBeNull())
    expect(fetchResumenBoardInputs).toHaveBeenCalledTimes(1)
    act(() => result.current.reload())
    await waitFor(() => expect(fetchResumenBoardInputs).toHaveBeenCalledTimes(2))
  })

  it('error de fetch → estado de error visible, no un board vacío que parece "sin datos"', async () => {
    fetchResumenBoardInputs.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() =>
      useResumenBoard({ tournament: TOURNAMENT, courseHoles: COURSE_HOLES, active: true }),
    )
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.rows).toEqual([])
  })
})
