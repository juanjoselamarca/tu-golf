import { describe, it, expect } from 'vitest'
import { shapeSeries, type RoundMetricJoinRow } from '../dashboard'

describe('shapeSeries — serie cronológica para el gráfico de avance', () => {
  it('ordena por fecha ascendente (más vieja → más nueva) y aplana el join', () => {
    const rows: RoundMetricJoinRow[] = [
      { strokes_over_par_round: 16, delta_vs_handicap_expected: 6, delta_vs_target_handicap: null, historical_rounds: { played_at: '2026-05-20' } },
      { strokes_over_par_round: 12, delta_vs_handicap_expected: 3, delta_vs_target_handicap: null, historical_rounds: { played_at: '2026-04-10' } },
      { strokes_over_par_round: 14, delta_vs_handicap_expected: 4, delta_vs_target_handicap: null, historical_rounds: { played_at: '2026-05-01' } },
    ]
    const s = shapeSeries(rows)
    expect(s.map((r) => r.played_at)).toEqual(['2026-04-10', '2026-05-01', '2026-05-20'])
    expect(s[0].delta_vs_handicap_expected).toBe(3)
  })

  it('tolera join nulo o como array (Supabase embed) sin romper', () => {
    const rows: RoundMetricJoinRow[] = [
      { strokes_over_par_round: 10, delta_vs_handicap_expected: 1, delta_vs_target_handicap: 2, historical_rounds: null },
      { strokes_over_par_round: 11, delta_vs_handicap_expected: 2, delta_vs_target_handicap: 3, historical_rounds: [{ played_at: '2026-05-05' }] },
    ]
    const s = shapeSeries(rows)
    expect(s).toHaveLength(2)
    // null played_at va primero (string vacío); el array se desempaqueta
    expect(s.find((r) => r.played_at === '2026-05-05')).toBeTruthy()
  })
})
