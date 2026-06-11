import { describe, it, expect, vi } from 'vitest'
import { shapeSeries, loadProgressDashboard, type RoundMetricJoinRow } from '../dashboard'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/golf/coach/v3/focus', () => ({ getFocus: vi.fn().mockResolvedValue({ kind: 'fallback' }), defaultFocusDeps: vi.fn(() => ({})) }))
vi.mock('@/lib/data/focus', () => ({ loadFocusTarget: vi.fn().mockResolvedValue(null) }))
vi.mock('../round-metrics', () => ({ backfillRoundMetrics: vi.fn().mockResolvedValue(undefined) }))

describe('shapeSeries — serie cronológica para el gráfico de avance', () => {
  it('ordena por fecha ascendente (más vieja → más nueva) y aplana el join', () => {
    const rows: RoundMetricJoinRow[] = [
      { strokes_over_par_round: 16, delta_vs_handicap_expected: 6, delta_vs_target_handicap: null, holes_played: 18, historical_rounds: { played_at: '2026-05-20' } },
      { strokes_over_par_round: 4, delta_vs_handicap_expected: 3, delta_vs_target_handicap: null, holes_played: 9, historical_rounds: { played_at: '2026-04-10' } },
      { strokes_over_par_round: 14, delta_vs_handicap_expected: 4, delta_vs_target_handicap: null, holes_played: 18, historical_rounds: { played_at: '2026-05-01' } },
    ]
    const s = shapeSeries(rows)
    expect(s.map((r) => r.played_at)).toEqual(['2026-04-10', '2026-05-01', '2026-05-20'])
    expect(s[0].delta_vs_handicap_expected).toBe(3)
    expect(s[0].holes_played).toBe(9) // 9h conserva su hole count (no confundir con 18h)
  })

  it('tolera join nulo o como array (Supabase embed) sin romper', () => {
    const rows: RoundMetricJoinRow[] = [
      { strokes_over_par_round: 10, delta_vs_handicap_expected: 1, delta_vs_target_handicap: 2, holes_played: 18, historical_rounds: null },
      { strokes_over_par_round: 11, delta_vs_handicap_expected: 2, delta_vs_target_handicap: 3, holes_played: 18, historical_rounds: [{ played_at: '2026-05-05' }] },
    ]
    const s = shapeSeries(rows)
    expect(s).toHaveLength(2)
    // null played_at va primero (string vacío); el array se desempaqueta
    expect(s.find((r) => r.played_at === '2026-05-05')).toBeTruthy()
  })
})

describe('loadProgressDashboard — cold start (sin meta ni rondas)', () => {
  const emptySupabase = {
    from(table: string) {
      if (table === 'round_metrics') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
      if (table === 'coach_plans') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }
      throw new Error('tabla inesperada: ' + table)
    },
  } as unknown as SupabaseClient

  it('no rompe y devuelve forma vacía renderizable (serie [], plan null, outcomes [])', async () => {
    const r = await loadProgressDashboard(emptySupabase, emptySupabase, 'u1')
    expect(r.serie).toEqual([])
    expect(r.activePlan).toBeNull()
    expect(r.outcomes).toEqual([])
    expect(r.target).toBeNull()
  })
})
