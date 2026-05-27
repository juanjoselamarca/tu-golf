/**
 * Regression snapshots de las 7 métricas v2.
 *
 * Anclamos comportamiento ANTES del refactor de `compute-plan-outcome.ts`
 * a `src/golf/coach/metrics/<metric>.ts` (Tasks 11-12).
 *
 * Las 7 funciones reales tienen firma `(round: RoundData)` — el plan
 * original asumía firmas separadas (hole_scores, par_per_hole). Ajustamos
 * el test al código real, no al plan.
 *
 * `computeTotalGrossCV` es async y consulta DB. Su snapshot se hace en
 * Task 12 cuando se extrae la lógica pura del CV a un archivo propio.
 */
import { describe, it, expect } from 'vitest'
import * as v2 from '../../compute-plan-outcome'

const SAMPLE_ROUND: v2.RoundData = {
  id: 'sample-round-1',
  scores: [4, 5, 6, 4, 5, 5, 4, 5, 6, 5, 4, 6, 5, 7, 5, 4, 5, 6],
  total_gross: 88,
  par_per_hole: {
    '1': 4, '2': 4, '3': 5, '4': 3, '5': 4, '6': 4, '7': 4, '8': 4, '9': 5,
    '10': 4, '11': 4, '12': 3, '13': 5, '14': 4, '15': 4, '16': 4, '17': 3, '18': 5,
  },
  played_at: '2026-05-01T10:00:00Z',
  metadata: null,
}

describe('métricas v2 — regresión post-refactor', () => {
  it('computeBack9MinusFront9 produce un número estable', () => {
    expect(v2.computeBack9MinusFront9(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeFirstHole produce un número estable', () => {
    expect(v2.computeFirstHole(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computePar3VsPar produce un número estable', () => {
    expect(v2.computePar3VsPar(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computePostBogeyAvg produce un número estable', () => {
    expect(v2.computePostBogeyAvg(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeDoubleOrWorsePct produce un número estable', () => {
    expect(v2.computeDoubleOrWorsePct(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeLast4MinusRest produce un número estable', () => {
    expect(v2.computeLast4MinusRest(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it.todo('computeTotalGrossCV (async + DB) — anclar en Task 12 al extraer lógica CV a metrics/total-gross-cv.ts')
})
