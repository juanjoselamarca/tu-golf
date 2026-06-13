/**
 * Validador anti-fantasía de patrones (Cerebro V3, Ola 3 chunk 2).
 *
 * Decide si un patrón es REAL para UN usuario o ruido, a partir de la serie de
 * observaciones per-ronda (`pattern_observations.value`) contra el resultado de
 * cada ronda (`historical_rounds.diferencial`). Función PURA y TOTAL: para
 * cualquier input devuelve un veredicto bien formado, sin NaN/Infinity/throw.
 * CERO FALLOS: datos insuficientes o degenerados → `valido:false` honesto,
 * JAMÁS "asumir válido".
 *
 * Dos gates en AND (magnitud Y estructura explicativa):
 *  - Cohen's d (median split, CON SIGNO) ≥ 0.3: las rondas donde el patrón se
 *    expresa fuerte deben ser PEORES (diferencial más alto). El signo evita
 *    validar patrones invertidos.
 *  - R² (OLS simple diferencial~valor) ≥ 0.15 y r>0: el valor explica ≥15% de
 *    la varianza del diferencial del usuario, en el sentido dañino.
 *  - N ≥ 15 pares completos (x,y).
 *
 * A N=15 la tasa de falso positivo compuesta (los 3 gates AND) baja a ~2-3%
 * (vs ~7% a N=10). El `pValue` (Fisher z) se reporta como metadata pero NO
 * es gate. El veredicto solo CO-elige el foco junto con detect+confianza+peso;
 * no es claim científico.
 */

export interface ObservationPair {
  /** Valor de la métrica del patrón en la ronda (orientación: más alto = peor). */
  x: number
  /** Diferencial WHS de la ronda (más alto = peor). */
  y: number
}

export interface ValidationThresholds {
  minN: number
  minEffectSize: number
  minR2: number
}

export const DEFAULT_THRESHOLDS: ValidationThresholds = { minN: 15, minEffectSize: 0.3, minR2: 0.15 }

export type VerdictReason =
  | 'passed'
  | 'serie_vacia'
  | 'insufficient_n'
  | 'degenerate_split'
  | 'degenerate_variance'
  | 'wrong_direction'
  | 'effect_too_small'
  | 'r2_too_low'

export interface PatternVerdict {
  valido: boolean
  n: number
  /** Cohen's d con signo; null si no computable. */
  effectSize: number | null
  r2: number | null
  /** Fisher-z, solo informativo (no gate). null si N≤3. */
  pValue: number | null
  /** mean(y_H) − mean(y_L): costo del patrón en strokes de diferencial. */
  meanDeltaStrokes: number | null
  razon: VerdictReason
}

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length
const sampleVar = (a: number[]): number => {
  const mu = mean(a)
  return a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1)
}

/** erf por Abramowitz–Stegun 7.1.26 (sin dependencias). */
function erf(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return sign * y
}
const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2))

function fail(n: number, razon: VerdictReason): PatternVerdict {
  return { valido: false, n, effectSize: null, r2: null, pValue: null, meanDeltaStrokes: null, razon }
}

export function validatePattern(
  pairs: ObservationPair[],
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS,
): PatternVerdict {
  // Sanidad: descartar pares no finitos ANTES de contar N (nunca propagan).
  const clean = pairs.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  const n = clean.length

  if (n === 0) return fail(0, 'serie_vacia')
  if (n < thresholds.minN) return fail(n, 'insufficient_n')

  const xs = clean.map((p) => p.x)
  const ys = clean.map((p) => p.y)

  // Median split (empates a L, determinista).
  const sorted = [...xs].sort((a, b) => a - b)
  const m = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  const yH = clean.filter((p) => p.x > m).map((p) => p.y)
  const yL = clean.filter((p) => p.x <= m).map((p) => p.y)
  if (yH.length < 3 || yL.length < 3) return fail(n, 'degenerate_split')

  const meanH = mean(yH)
  const meanL = mean(yL)
  const sPooled = Math.sqrt(((yH.length - 1) * sampleVar(yH) + (yL.length - 1) * sampleVar(yL)) / (yH.length + yL.length - 2))

  const xbar = mean(xs)
  const ybar = mean(ys)
  const sxx = xs.reduce((s, v) => s + (v - xbar) ** 2, 0)
  const syy = ys.reduce((s, v) => s + (v - ybar) ** 2, 0)
  if (sPooled === 0 || sxx === 0 || syy === 0) return fail(n, 'degenerate_variance')

  const d = (meanH - meanL) / sPooled
  const meanDeltaStrokes = meanH - meanL
  const sxy = clean.reduce((s, p) => s + (p.x - xbar) * (p.y - ybar), 0)
  const r = sxy / Math.sqrt(sxx * syy)
  const r2 = r * r

  // pValue (Fisher z) — informativo. Clamp de r para no producir Infinity.
  const rClamped = Math.max(-0.999999, Math.min(0.999999, r))
  const pValue = n > 3 ? 2 * (1 - normalCdf(Math.abs(Math.atanh(rClamped)) * Math.sqrt(n - 3))) : null

  const base = { n, effectSize: d, r2, pValue, meanDeltaStrokes }

  // Gates en AND, con precedencia de razón.
  let razon: VerdictReason
  if (r <= 0 || d < 0) razon = 'wrong_direction'
  else if (d < thresholds.minEffectSize) razon = 'effect_too_small'
  else if (r2 < thresholds.minR2) razon = 'r2_too_low'
  else razon = 'passed'

  return { ...base, valido: razon === 'passed', razon }
}
