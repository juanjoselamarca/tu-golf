/**
 * Agregación pura del examen y comparación contra el baseline committeado.
 * Sin I/O: recibe los resultados por caso, devuelve el scorecard y el veredicto
 * de regresión. El runner LIVE persiste/compara; esto solo computa.
 */

export interface CaseResult {
  caseId: string
  tags: string[]
  correctnessPass: boolean
  sixPiecesApplicable: boolean
  sixPiecesScore: number | null
}

export interface Scorecard {
  total: number
  correctnessPassRate: number
  sixPiecesAvg: number // promedio sobre los casos aplicables (0 si no hay)
  perCase: Record<string, { correctnessPass: boolean; sixPiecesScore: number | null }>
}

export function buildScorecard(results: CaseResult[]): Scorecard {
  const total = results.length
  const passed = results.filter((r) => r.correctnessPass).length
  const sixers = results.filter((r) => r.sixPiecesApplicable && r.sixPiecesScore != null)
  const sixSum = sixers.reduce((acc, r) => acc + (r.sixPiecesScore ?? 0), 0)
  const perCase: Scorecard['perCase'] = {}
  for (const r of results) perCase[r.caseId] = { correctnessPass: r.correctnessPass, sixPiecesScore: r.sixPiecesScore }
  return {
    total,
    correctnessPassRate: total ? passed / total : 0,
    sixPiecesAvg: sixers.length ? sixSum / sixers.length : 0,
    perCase,
  }
}

export interface BaselineComparison {
  regressed: boolean
  reasons: string[]
}

export function compareToBaseline(
  current: Scorecard,
  baseline: Scorecard,
  tol: { passRateTol: number; sixPiecesTol: number },
): BaselineComparison {
  const reasons: string[] = []
  if (current.correctnessPassRate < baseline.correctnessPassRate - tol.passRateTol) {
    reasons.push(
      `correctness pass-rate cayó: ${current.correctnessPassRate.toFixed(3)} < baseline ${baseline.correctnessPassRate.toFixed(3)}`,
    )
  }
  if (current.sixPiecesAvg < baseline.sixPiecesAvg - tol.sixPiecesTol) {
    reasons.push(
      `score de 6 piezas cayó: ${current.sixPiecesAvg.toFixed(2)} < baseline ${baseline.sixPiecesAvg.toFixed(2)}`,
    )
  }
  return { regressed: reasons.length > 0, reasons }
}
