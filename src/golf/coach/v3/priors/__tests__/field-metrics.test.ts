import { describe, it, expect } from 'vitest'
import { measureFieldMetric, fieldMetricLabel } from '../field-metrics'
import type { RoundData } from '@/golf/coach/metrics'

// Layout con 4 par-3, 11 par-4, 3 par-5. par-3 jugados a bogey (+1),
// par-4 a par (0), par-5 a birdie (−1).
const PARS = [4, 4, 3, 4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4]

function round(id: string): RoundData {
  const scores = PARS.map((p) => (p === 3 ? p + 1 : p === 5 ? p - 1 : p))
  return {
    id,
    scores,
    total_gross: scores.reduce((a, b) => a + b, 0),
    par_per_hole: Object.fromEntries(PARS.map((p, i) => [String(i + 1), p])),
    played_at: '2026-05-01',
    metadata: { holes_played: 18 },
  } as RoundData
}

describe('measureFieldMetric', () => {
  const rounds = [round('a'), round('b'), round('c')]

  it('par3_avg_vs_par = +1 (par-3 a bogey)', () => {
    expect(measureFieldMetric(rounds, 'par3_avg_vs_par')).toEqual({ valor: 1, muestra: 3 })
  })

  it('par4_avg_vs_par = 0 (par-4 a par)', () => {
    expect(measureFieldMetric(rounds, 'par4_avg_vs_par')).toEqual({ valor: 0, muestra: 3 })
  })

  it('par5_avg_vs_par = −1 (par-5 a birdie)', () => {
    expect(measureFieldMetric(rounds, 'par5_avg_vs_par')).toEqual({ valor: -1, muestra: 3 })
  })

  it('métrica no registrada → null (no rompe)', () => {
    expect(measureFieldMetric(rounds, 'total_gross_cv')).toBeNull()
  })

  it('sin rondas → null', () => {
    expect(measureFieldMetric([], 'par4_avg_vs_par')).toBeNull()
  })

  it('fieldMetricLabel mapea las 3 métricas y null si no existe', () => {
    expect(fieldMetricLabel('par3_avg_vs_par')).toBe('Juego en par 3')
    expect(fieldMetricLabel('par4_avg_vs_par')).toBe('Juego en par 4')
    expect(fieldMetricLabel('par5_avg_vs_par')).toBe('Juego en par 5')
    expect(fieldMetricLabel('inexistente')).toBeNull()
  })
})
