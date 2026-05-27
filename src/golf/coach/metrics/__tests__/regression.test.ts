/**
 * Regression snapshots de las 7 métricas v2.
 *
 * Originalmente (Ola 0 Task 4) los snapshots anclaban funciones internas
 * de `compute-plan-outcome.ts` antes del refactor. Tras Task 12, cada
 * métrica vive en `src/golf/coach/metrics/<name>.ts` con su firma natural
 * pública. Los snapshots persisten exactamente igual: las algoritmos no
 * cambiaron, sólo migraron de archivo.
 *
 * `computeTotalGrossCV` es async + DB-dependent. Anclamos `computeCV`
 * (lógica pura del coefficient of variation) que es lo que de verdad
 * importa para regresión post-refactor.
 */
import { describe, it, expect } from 'vitest'
import {
  computeBack9MinusFront9,
  computeFirstHole,
  computePar3VsPar,
  computePostBogeyAvg,
  computeDoubleOrWorsePct,
  computeLast4MinusRest,
  computeCV,
  type RoundData,
} from '@/golf/coach/metrics'

const SAMPLE_ROUND: RoundData = {
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
    expect(computeBack9MinusFront9(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeFirstHole produce un número estable', () => {
    expect(computeFirstHole(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computePar3VsPar produce un número estable', () => {
    expect(computePar3VsPar(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computePostBogeyAvg produce un número estable', () => {
    expect(computePostBogeyAvg(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeDoubleOrWorsePct produce un número estable', () => {
    expect(computeDoubleOrWorsePct(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeLast4MinusRest produce un número estable', () => {
    expect(computeLast4MinusRest(SAMPLE_ROUND)).toMatchSnapshot()
  })

  it('computeCV (lógica pura del CV) produce un número estable', () => {
    // 10 rondas con grosses entre 86 y 90 (típico golfista índice ~18 consistente).
    const grosses = [86, 87, 88, 89, 90, 88, 87, 89, 88, 86]
    expect(computeCV(grosses)).toMatchSnapshot()
  })

  it('computeCV con <5 muestras devuelve null', () => {
    expect(computeCV([86, 87, 88, 89])).toEqual({
      value: null,
      reason: 'insufficient_rounds_for_cv',
    })
  })
})
