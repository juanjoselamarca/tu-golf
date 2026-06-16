import { detectPatterns, type PatternRound } from '@/golf/coach/patterns'
import { parPerHoleArray } from '@/golf/core/holes'
import { sum, type RoundData } from '@/golf/coach/metrics'
import type { CerebroWeight } from '@/lib/cerebro/weights'
import { FOCUS_CATALOG, type DetectInfo } from './catalog'
import type { Focus, FocusResult, FocusTarget, SelectFocusInput } from './types'
import { shrink } from '../priors/shrinkage'

/** Mínimo de rondas para siquiera intentar un foco. Menos = cold start honesto. */
export const MIN_ROUNDS_FOR_FOCUS = 3

/** Peso por defecto de un patrón cuando cerebro_weights aún no tiene override. */
export const DEFAULT_PATTERN_WEIGHT = 0.5

/** delta_vs_target = handicap_actual − handicap_objetivo (positivo = arriba del objetivo). */
export function deltaVsTarget(target: FocusTarget | null): number | null {
  if (!target) return null
  const { currentHandicap, targetHandicap } = target
  if (currentHandicap == null || targetHandicap == null) return null
  return Math.round((currentHandicap - targetHandicap) * 10) / 10
}

/** Peso vivo del patrón (parameter_type='pattern') leído de cerebro_weights. */
export function patternWeight(weights: CerebroWeight[], patternId: string, defaultWeight?: number): number {
  const w = weights.find(
    (x) => x.parameter_type === 'pattern' && x.parameter_key === patternId,
  )
  if (w) return w.current_weight
  if (typeof defaultWeight === 'number') return defaultWeight
  return DEFAULT_PATTERN_WEIGHT
}

function toPatternRound(r: RoundData): PatternRound {
  const arr = parPerHoleArray(r.par_per_hole)
  const holePars = arr && arr.length === 18 ? arr : undefined
  return {
    scores: Array.isArray(r.scores) ? r.scores : [],
    total_gross: typeof r.total_gross === 'number' ? r.total_gross : 0,
    par_total: holePars ? sum(holePars) : 72,
    course_name: '',
    played_at: r.played_at,
    hole_pars: holePars,
    metadata: r.metadata,
  }
}

/**
 * Selecciona EL foco de mayor impacto hacia la meta, o un fallback honesto.
 * Función pura: toda I/O (historial, pesos, target) la resuelve el orquestador.
 *
 * Impacto = confianza_del_detect × peso_del_patrón. La confianza (de patterns.ts)
 * es severidad ya calibrada; el peso (cerebro_weights) es cuánto mover ese patrón
 * acerca al handicap objetivo. El producto es la ganancia esperada de enfocarse ahí.
 */
export function selectFocus(input: SelectFocusInput): FocusResult {
  const delta = deltaVsTarget(input.target)
  const handicap = input.target?.currentHandicap ?? null

  if (input.rounds.length < MIN_ROUNDS_FOR_FOCUS) {
    return { kind: 'fallback', reason: 'cold_start', handicap, deltaVsTarget: delta }
  }

  const patternRounds = input.rounds.map(toPatternRound)
  const detectedMap = new Map<string, DetectInfo>()
  for (const d of detectPatterns(patternRounds)) {
    detectedMap.set(d.pattern.id, { confidence: d.confidence, metadata: d.metadata ?? {} })
  }

  const candidates: Focus[] = []
  for (const c of input.catalog ?? FOCUS_CATALOG) {
    const detected = detectedMap.get(c.patternId)
    if (!detected) continue // gate: patrón no detectado → nunca foco-fantasía
    if (detected.confidence < c.minConfidence) continue
    const baseline = c.measure({ rounds: input.rounds, detected })
    if (!baseline) continue
    if (baseline.muestra < c.minSample) continue // gate: muestra insuficiente

    // Gate del validador anti-fantasía (Ola 3 chunk 2), por tiers:
    //  - veredicto concluyente negativo (hubo datos) → EXCLUIDO siempre, aunque el detect dispare.
    //  - sin datos o sin veredicto → seed sigue por su gate de detect; no-seed se excluye.
    const verdict = input.validation?.[c.patternId]
    const esSeed = (c.source ?? 'seed') === 'seed'
    const datosConcluyentes =
      !!verdict && !verdict.valido &&
      ['effect_too_small', 'r2_too_low', 'wrong_direction', 'degenerate_variance', 'degenerate_split'].includes(
        verdict.razon,
      )
    if (datosConcluyentes) continue
    const validadoOk = verdict?.valido === true
    const sinDatos = !verdict || verdict.razon === 'serie_vacia' || verdict.razon === 'insufficient_n'
    if (!validadoOk && !(sinDatos && esSeed)) continue

    const peso = patternWeight(input.weights, c.patternId, c.defaultWeight)
    const impacto = Math.round(detected.confidence * peso * 10000) / 10000

    // Shrinkage (Ola 1b): si hay prior externo para esta métrica, el valor
    // REPORTADO se ajusta hacia "lo normal del bucket" según la precisión del
    // jugador. No toca el ranking (impacto) ni los gates de Ola 3. Sin prior
    // inyectado ⇒ valor sin cambios (backward-compatible).
    const prior = input.priors?.[c.metricKey]
    const valorReportado = prior
      ? Math.round(
          shrink({
            playerMean: baseline.valor,
            n: baseline.muestra,
            priorMean: prior.priorMean,
            sigma2Within: prior.sigma2Within,
            tau2Between: prior.tau2Between,
          }) * 100,
        ) / 100
      : baseline.valor

    candidates.push({
      kind: 'focus',
      patternId: c.patternId,
      metricKey: c.metricKey,
      label: c.label,
      accion: c.accion,
      impacto,
      confianza: detected.confidence,
      peso,
      metrica: { key: c.metricKey, valor: valorReportado, muestra: baseline.muestra },
      evidencia: detected.metadata,
      validacion: verdict
        ? { n: verdict.n, effectSize: verdict.effectSize, r2: verdict.r2, meanDeltaStrokes: verdict.meanDeltaStrokes }
        : null,
      deltaVsTarget: delta,
    })
  }

  if (candidates.length === 0) {
    return { kind: 'fallback', reason: 'no_pattern_passed_gate', handicap, deltaVsTarget: delta }
  }

  // Rankeo determinista: impacto desc, desempate por confianza desc y luego id.
  candidates.sort(
    (a, b) =>
      b.impacto - a.impacto ||
      b.confianza - a.confianza ||
      a.patternId.localeCompare(b.patternId),
  )
  return candidates[0]
}
