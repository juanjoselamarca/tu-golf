import { describe, it, expect } from 'vitest'
import { computeRoundMetric, type HistoricalRoundRow } from '../round-metrics'

const PAR72 = Object.fromEntries(
  [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5].map((p, i) => [String(i + 1), p]),
)

function row(over: Partial<HistoricalRoundRow> = {}): HistoricalRoundRow {
  return {
    id: 'r1',
    total_gross: 88,
    holes_played: 18,
    par_per_hole: PAR72,
    diferencial: '15.3',
    excluded_from_handicap: false,
    ...over,
  }
}

describe('computeRoundMetric — métricas relativas WHS (18h)', () => {
  it('computa strokes sobre par y delta vs handicap esperado (diferencial − índice)', () => {
    const m = computeRoundMetric(row(), 'u1', 9.6, null)
    expect(m).not.toBeNull()
    expect(m!.round_id).toBe('r1')
    expect(m!.user_id).toBe('u1')
    expect(m!.par_cancha).toBe(72)
    expect(m!.strokes_over_par_round).toBe(16) // 88 − 72
    expect(m!.delta_vs_handicap_expected).toBeCloseTo(5.7) // 15.3 − 9.6
    expect(m!.holes_played).toBe(18)
    expect(m!.handicap_at_time).toBe(9.6)
  })

  it('sin meta: delta_vs_target y target_at_time son ambos NULL (contrato CHECK)', () => {
    const m = computeRoundMetric(row(), 'u1', 9.6, null)
    expect(m!.delta_vs_target_handicap).toBeNull()
    expect(m!.target_at_time).toBeNull()
  })

  it('con meta: delta vs target = diferencial − target', () => {
    const m = computeRoundMetric(row(), 'u1', 9.6, 7)
    expect(m!.delta_vs_target_handicap).toBeCloseTo(8.3) // 15.3 − 7
    expect(m!.target_at_time).toBe(7)
  })

  it('parsea diferencial cuando viene como string (numeric de Postgres)', () => {
    const m = computeRoundMetric(row({ diferencial: '12.00' }), 'u1', 9.6, null)
    expect(m!.delta_vs_handicap_expected).toBeCloseTo(2.4) // 12 − 9.6
  })
})

describe('computeRoundMetric — gate de no-fantasía (devuelve null, no inventa)', () => {
  it('ronda de 9 hoyos → null (diferencial 9h no es comparable al índice 18h)', () => {
    expect(computeRoundMetric(row({ holes_played: 9 }), 'u1', 9.6, null)).toBeNull()
  })

  it('excluida del handicap → null', () => {
    expect(computeRoundMetric(row({ excluded_from_handicap: true }), 'u1', 9.6, null)).toBeNull()
  })

  it('sin diferencial → null', () => {
    expect(computeRoundMetric(row({ diferencial: null }), 'u1', 9.6, null)).toBeNull()
  })

  it('sin par_per_hole → null (no se puede fijar par de cancha)', () => {
    expect(computeRoundMetric(row({ par_per_hole: null }), 'u1', 9.6, null)).toBeNull()
  })

  it('sin índice → null (no se puede computar delta esperado, columna NOT NULL)', () => {
    expect(computeRoundMetric(row(), 'u1', null, null)).toBeNull()
  })

  it('sin total_gross → null', () => {
    expect(computeRoundMetric(row({ total_gross: null }), 'u1', 9.6, null)).toBeNull()
  })
})
