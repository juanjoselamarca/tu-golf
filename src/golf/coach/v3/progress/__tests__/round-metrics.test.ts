import { describe, it, expect } from 'vitest'
import { computeRoundMetric, type HistoricalRoundRow } from '../round-metrics'

const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
const PAR72 = Object.fromEntries(PARS.map((p, i) => [String(i + 1), p]))
const FRONT9_PAR = PARS.slice(0, 9).reduce((a, b) => a + b, 0) // 36

function row(over: Partial<HistoricalRoundRow> = {}): HistoricalRoundRow {
  return {
    id: 'r1',
    total_gross: 88,
    holes_played: 18,
    par_per_hole: PAR72,
    diferencial: '15.3',
    course_rating: 72.0,
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

describe('computeRoundMetric — rondas de 9 hoyos (diferencial ya es equiv-18h)', () => {
  // El app guarda el diferencial 9h escalado ×2 a equivalente-18h (indice-golfers.ts),
  // así que es comparable al índice igual que las 18h. Par de cancha = front 9.
  it('9h con CR de 18 hoyos (≥55): computa, par = front 9, holes_played = 9', () => {
    const m = computeRoundMetric(
      row({ holes_played: 9, course_rating: 72.0, diferencial: '2.24', total_gross: 40 }),
      'u1',
      9.6,
      null,
    )
    expect(m).not.toBeNull()
    expect(m!.holes_played).toBe(9)
    expect(m!.par_cancha).toBe(FRONT9_PAR) // 36
    expect(m!.strokes_over_par_round).toBe(4) // 40 − 36
    expect(m!.delta_vs_handicap_expected).toBeCloseTo(-7.4) // round1(2.24 − 9.6)
  })

  it('9h con meta: delta vs target usa el mismo diferencial equiv-18h', () => {
    const m = computeRoundMetric(
      row({ holes_played: 9, course_rating: 72.0, diferencial: '2.24', total_gross: 40 }),
      'u1',
      9.6,
      7,
    )
    expect(m!.delta_vs_target_handicap).toBeCloseTo(-4.8) // round1(2.24 − 7)
    expect(m!.target_at_time).toBe(7)
  })

  it('9h legacy con CR de 9 hoyos (<55) → null (diferencial raw, no comparable)', () => {
    const m = computeRoundMetric(
      row({ holes_played: 9, course_rating: 37.2, diferencial: '0.70', total_gross: 38 }),
      'u1',
      9.6,
      null,
    )
    expect(m).toBeNull()
  })

  it('9h sin course_rating → null (no se puede descartar el caso legacy)', () => {
    const m = computeRoundMetric(
      row({ holes_played: 9, course_rating: null, diferencial: '2.24', total_gross: 40 }),
      'u1',
      9.6,
      null,
    )
    expect(m).toBeNull()
  })
})

describe('computeRoundMetric — gate de no-fantasía (devuelve null, no inventa)', () => {
  it('hole count inválido (no 9 ni 18) → null', () => {
    expect(computeRoundMetric(row({ holes_played: 13 }), 'u1', 9.6, null)).toBeNull()
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

describe('computeRoundMetric — edge cases de par y gross', () => {
  const PAR9_OBJ = Object.fromEntries(PARS.slice(0, 9).map((p, i) => [String(i + 1), p])) // 9 entradas, suma 36

  it('9h con par_per_hole de 9 entradas → usa esos 9 (par 36)', () => {
    const m = computeRoundMetric(
      row({ holes_played: 9, course_rating: 72, diferencial: '5.0', total_gross: 41, par_per_hole: PAR9_OBJ }),
      'u1',
      9.6,
      null,
    )
    expect(m).not.toBeNull()
    expect(m!.par_cancha).toBe(36)
    expect(m!.strokes_over_par_round).toBe(5) // 41 − 36
  })

  it('18h con par_per_hole de solo 9 entradas → null (datos insuficientes)', () => {
    expect(
      computeRoundMetric(row({ holes_played: 18, par_per_hole: PAR9_OBJ }), 'u1', 9.6, null),
    ).toBeNull()
  })

  it('9h con front asimétrico (par 37) → par de cancha = front 9 REAL, no asumido', () => {
    const asym = { ...PAR72, '5': 6 } // hoyo 5 par 6 → front sube de 36 a 37
    const m = computeRoundMetric(
      row({ holes_played: 9, course_rating: 72, diferencial: '5.0', total_gross: 42, par_per_hole: asym }),
      'u1',
      9.6,
      null,
    )
    expect(m!.par_cancha).toBe(37)
    expect(m!.strokes_over_par_round).toBe(5) // 42 − 37
  })

  it('total_gross como string numérico (PostgREST numeric) → parsea', () => {
    const m = computeRoundMetric(row({ total_gross: '88' }), 'u1', 9.6, null)
    expect(m!.strokes_over_par_round).toBe(16) // 88 − 72
  })

  it('diferencial 0 exacto es válido (no se confunde con falsy)', () => {
    const m = computeRoundMetric(row({ diferencial: 0 }), 'u1', 9.6, null)
    expect(m).not.toBeNull()
    expect(m!.delta_vs_handicap_expected).toBeCloseTo(-9.6) // 0 − 9.6
  })
})
