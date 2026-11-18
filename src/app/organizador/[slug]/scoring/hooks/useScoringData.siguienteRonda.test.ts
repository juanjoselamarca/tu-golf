// Fable #829 v2: "Abrir ronda 2" con la relectura del roster fallida. activeRoundNum queda en 2 con el roster
// viejo (solo tarjetas de la ronda 1): todos aparecen "sin tarjeta". La pestaña 2 tiene que seguir siendo la
// vigente (para que "Crear su tarjeta" relea y lo destrabe) y nada de la ronda 1 se pierde ni se edita.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ScoringPlayer } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const showError = vi.fn()
const toast = { showError, showSuccess: vi.fn(), showWarning: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const fetchScoringRoster = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchScoringTournament: vi.fn(async () => ({ id: 't1', slug: 'copa', total_rounds: 2, hole_count: 18, courses: null })),
  fetchScoringRoster: (...a: unknown[]) => fetchScoringRoster(...a),
  fetchScoringCourseContext: vi.fn(async () => ({ holes: [], tees: [] })),
  fetchBulkRoundHoleCounts: vi.fn(async () => new Map()),
  fetchRoundScoringContext: vi.fn(async () => ({ courseHoles: [], holeCount: 18 })),
}))

import { useScoringData } from './useScoringData'

const jugador = (id: string, rounds: Array<{ id: string; round_number: number; status: string }>) =>
  ({ id, status: 'approved', player_name: id, profiles: null, rounds }) as unknown as ScoringPlayer
const ROSTER_R1 = [jugador('a', [{ id: 'a1', round_number: 1, status: 'closed' }]), jugador('b', [{ id: 'b1', round_number: 1, status: 'closed' }])]
const ROSTER_R2 = ROSTER_R1.map((p) => ({ ...p, rounds: [...(p.rounds ?? []), { id: `${p.id}2`, round_number: 2, status: 'in_progress' }] })) as unknown as ScoringPlayer[]

describe('useScoringData — ronda siguiente con la relectura fallida', () => {
  beforeEach(() => {
    fetchScoringRoster.mockReset(); showError.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ roundNumber: 2, playersCount: 2 }) })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('queda en la ronda 2 vigente, sin mostrar la tarjeta de la 1; la recarga lo resuelve', async () => {
    fetchScoringRoster.mockResolvedValueOnce(ROSTER_R1)
    const { result } = renderHook(() => useScoringData('copa'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeRoundNum).toBe(1)
    expect(result.current.canStartNextRound).toBe(true)

    fetchScoringRoster.mockRejectedValueOnce(new Error('red'))
    await act(async () => { await result.current.startNextRound() })

    expect(result.current.activeRoundNum).toBe(2)
    expect(showError).toHaveBeenCalledWith('Error', 'No pudimos refrescar la lista de jugadores.')
    // Roster viejo: nadie tiene tarjeta de la 2, y NO se cae a la de la ronda 1 (no se edita ni se cierra).
    for (const p of result.current.players) expect(result.current.getActiveRound(p)).toBeUndefined()
    // La pestaña 2 sigue siendo la vigente: "Crear su tarjeta" se ofrece (y relee).
    expect(result.current.esRondaVigente).toBe(true)
    // Las tarjetas de la ronda 1 siguen ahí, intactas.
    expect(result.current.players.map((p) => p.rounds?.[0]?.status)).toEqual(['closed', 'closed'])

    fetchScoringRoster.mockResolvedValueOnce(ROSTER_R2)
    let releido = false
    await act(async () => { releido = await result.current.reloadRoster() })
    expect(releido).toBe(true)
    expect(result.current.players.map((p) => result.current.getActiveRound(p)?.id)).toEqual(['a2', 'b2'])
    expect(result.current.esRondaVigente).toBe(true)
  })

  it('mirando la ronda 1 con la 2 abierta, la 1 no es la vigente', async () => {
    fetchScoringRoster.mockResolvedValueOnce(ROSTER_R2)
    const { result } = renderHook(() => useScoringData('copa'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeRoundNum).toBe(2)
    expect(result.current.esRondaVigente).toBe(true)
    act(() => { result.current.selectRound(1) })
    expect(result.current.activeRoundNum).toBe(1)
    expect(result.current.esRondaVigente).toBe(false)
  })
})
