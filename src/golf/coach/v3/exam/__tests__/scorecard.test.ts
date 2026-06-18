import { describe, it, expect } from 'vitest'
import { buildScorecard, compareToBaseline, type CaseResult, type Scorecard } from '../scorecard'

const results: CaseResult[] = [
  { caseId: 'a', tags: ['data-access'], correctnessPass: true, sixPiecesApplicable: false, sixPiecesScore: null },
  { caseId: 'b', tags: ['6-piezas'], correctnessPass: true, sixPiecesApplicable: true, sixPiecesScore: 6 },
  { caseId: 'c', tags: ['6-piezas'], correctnessPass: false, sixPiecesApplicable: true, sixPiecesScore: 4 },
]

describe('buildScorecard', () => {
  it('computa pass-rate de correctness y promedio de 6-piezas (solo aplicables)', () => {
    const sc = buildScorecard(results)
    expect(sc.total).toBe(3)
    expect(sc.correctnessPassRate).toBeCloseTo(2 / 3)
    expect(sc.sixPiecesAvg).toBeCloseTo((6 + 4) / 2)
    expect(sc.perCase.c.correctnessPass).toBe(false)
  })
})

describe('compareToBaseline', () => {
  const baseline: Scorecard = { total: 3, correctnessPassRate: 1.0, sixPiecesAvg: 6.0, perCase: {} }
  it('detecta regresión cuando el pass-rate cae más que la tolerancia', () => {
    const sc = buildScorecard(results) // pass-rate 0.667 < 1.0
    const cmp = compareToBaseline(sc, baseline, { passRateTol: 0.01, sixPiecesTol: 0.1 })
    expect(cmp.regressed).toBe(true)
    expect(cmp.reasons.join(' ')).toMatch(/correctness/i)
  })

  it('detecta colapso de cobertura: menos casos que el baseline (aunque suba el pass-rate)', () => {
    const sc = buildScorecard([results[1]]) // 1 caso, pass-rate 1.0
    const cmp = compareToBaseline(
      sc,
      { total: 21, correctnessPassRate: 1.0, sixPiecesAvg: 6.0, perCase: {} },
      { passRateTol: 0.01, sixPiecesTol: 0.1 },
    )
    expect(cmp.regressed).toBe(true)
    expect(cmp.reasons.join(' ')).toMatch(/casos bajó/i)
  })

  it('no marca colapso de cobertura cuando el baseline arranca en 0 (permisivo)', () => {
    const sc = buildScorecard(results) // 3 casos
    const cmp = compareToBaseline(
      sc,
      { total: 0, correctnessPassRate: 0, sixPiecesAvg: 0, perCase: {} },
      { passRateTol: 0.05, sixPiecesTol: 0.3 },
    )
    expect(cmp.regressed).toBe(false)
  })

  it('no marca regresión si está dentro de la tolerancia', () => {
    const sc = buildScorecard([results[1]]) // pass-rate 1.0, sixPieces 6
    const cmp = compareToBaseline(
      sc,
      { total: 1, correctnessPassRate: 1.0, sixPiecesAvg: 6.0, perCase: {} },
      { passRateTol: 0.01, sixPiecesTol: 0.1 },
    )
    expect(cmp.regressed).toBe(false)
  })
})
