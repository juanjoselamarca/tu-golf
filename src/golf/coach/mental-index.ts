/**
 * Mental Index — score psicológico compuesto 0-100 del jugador.
 *
 * Composite que penaliza patrones psicológicos activos y suma bonus por
 * adherencia al plan + consistencia (de CPI). Determinístico, sin LLM.
 *
 * Spec: docs/superpowers/specs/2026-05-10-taiger-coach-home-redesign-design.md §6.1
 *
 * Vive junto al motor del coach (no en stats/) porque solo lo usa el coach UI.
 */

import type { ResultadoCPI } from '@/golf/stats/cpi'

const MENTAL_PATTERN_PENALTIES: Record<string, number> = {
  post_bogey_spiral: 25,       // critical
  pressure_deterioration: 15,  // warning
  first_hole_anxiety: 10,      // warning
}

const STANDARD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]

export interface MentalIndexInput {
  activePatterns: Array<{ pattern_type: string; confidence: number }>
  activePlan: { id: string } | null
  outcomes: Array<{ target_reached: boolean; compliance: string }>
  cpi: ResultadoCPI | null
  totalRounds: number
  previousScore: number | null
}

export interface MentalIndexResult {
  score: number
  band: 'low' | 'mid' | 'high'
  status: 'insufficient_data' | 'provisional' | 'established'
  delta: number | null
  breakdown: {
    base: number
    patternPenalty: number
    adherenceBonus: number
    consistencyBonus: number
  }
}

export type MentalState = 'calm' | 'tense' | 'tilt'

export interface RoundForAnalysis {
  id: string
  scores: (number | null)[]
  hole_pars?: number[] | null
}

export interface StrokesEvitablesResult {
  total: number
  instances: Array<{ round_id: string; holes: string[]; strokes_saved: number }>
}

export interface RoundForCostoPsicologico extends RoundForAnalysis {
  total_gross: number | null
}

export interface CostoPsicologicoResult {
  /** Strokes evitables totales sobre el universo (windowSize rondas). */
  evitables: number
  /** Promedio de total_gross sobre el universo. */
  promedioReal: number
  /** Promedio "contenido" = promedioReal − evitables/windowSize. */
  promedioContenido: number
  /** Tamaño real del universo (rondas usadas). Puede ser < cap si hay menos. */
  windowSize: number
  /** Datos de la última ronda, solo si tuvo ≥1 espiral evitable. */
  lastRound: {
    id: string
    realScore: number
    ghostScore: number
    strokes_saved: number
    holes: string[]
  } | null
}

export function calcularMentalIndex(input: MentalIndexInput): MentalIndexResult {
  let score = 100
  let patternPenalty = 0
  let adherenceBonus = 0
  let consistencyBonus = 0

  // Penalizaciones por patrones psicológicos
  for (const p of input.activePatterns) {
    const penalty = MENTAL_PATTERN_PENALTIES[p.pattern_type]
    if (penalty) {
      const actual = penalty * p.confidence
      score -= actual
      patternPenalty += actual
    }
  }

  // Bonus de adherencia
  if (input.activePlan && input.outcomes.length > 0) {
    const targetReachedRatio = input.outcomes.filter(o => o.target_reached).length / input.outcomes.length
    const complianceFullRatio = input.outcomes.filter(o => o.compliance === 'full').length / input.outcomes.length
    const tBonus = 10 * targetReachedRatio
    const cBonus = 5 * complianceFullRatio
    score += tBonus + cBonus
    adherenceBonus = tBonus + cBonus
  }

  // Bonus de consistencia (de CPI)
  if (input.cpi && input.cpi.status !== 'insufficient_data') {
    const consistenciaNorm = (input.cpi.breakdown?.consistencia ?? 0) / 25
    const cBonus = 5 * consistenciaNorm
    score += cBonus
    consistencyBonus = cBonus
  }

  // Cap
  score = Math.max(0, Math.min(100, score))
  const finalScore = Math.round(score)

  const band: 'low' | 'mid' | 'high' =
    finalScore >= 67 ? 'high' : finalScore >= 34 ? 'mid' : 'low'

  const status: 'insufficient_data' | 'provisional' | 'established' =
    input.totalRounds < 3 ? 'insufficient_data'
      : input.totalRounds < 10 ? 'provisional'
        : 'established'

  const delta = input.previousScore != null ? finalScore - input.previousScore : null

  return {
    score: finalScore,
    band,
    status,
    delta,
    breakdown: {
      base: 100,
      patternPenalty: Math.round(patternPenalty * 10) / 10,
      adherenceBonus: Math.round(adherenceBonus * 10) / 10,
      consistencyBonus: Math.round(consistencyBonus * 10) / 10,
    },
  }
}

export function strokesEvitables(rounds: RoundForAnalysis[]): StrokesEvitablesResult {
  let total = 0
  const instances: Array<{ round_id: string; holes: string[]; strokes_saved: number }> = []

  for (const r of rounds) {
    if (!Array.isArray(r.scores)) continue
    // Saltamos rondas sin hole_pars explícito o con length mismatch:
    // STANDARD_PARS asume par 72 y miente en canchas chilenas par 71 (Los Leones, Sport Francés, PoW).
    if (!Array.isArray(r.hole_pars) || r.hole_pars.length !== r.scores.length) continue
    const holes: string[] = []
    let strokesSavedRound = 0

    for (let i = 0; i < r.scores.length - 1; i++) {
      const s = r.scores[i]
      const next = r.scores[i + 1]
      if (s == null || next == null) continue

      const par_i = parForHole(r, i)
      const par_next = parForHole(r, i + 1)
      const isPostBogey = s >= par_i + 1
      const isFollowedByBogey = next >= par_next + 1

      if (isPostBogey && isFollowedByBogey) {
        const actualOver = next - par_next
        const containedOver = 1
        const evitable = Math.max(0, actualOver - containedOver)
        if (evitable > 0) {
          total += evitable
          strokesSavedRound += evitable
          holes.push(`H${i + 1}→H${i + 2}`)
        }
      }
    }

    if (holes.length) instances.push({ round_id: r.id, holes, strokes_saved: strokesSavedRound })
  }

  return { total, instances }
}

export function clasificarHoyo(round: RoundForAnalysis, i: number): MentalState | null {
  const score = round.scores[i]
  if (score == null) return null

  const par = parForHole(round, i)
  const prevScore = i > 0 ? round.scores[i - 1] : null
  const prevPar = i > 0 ? parForHole(round, i - 1) : null

  const overPar = score - par
  const prevOverPar = prevScore != null && prevPar != null ? prevScore - prevPar : 0

  // Tilt: doble bogey o peor, o cualquier ≥bogey tras un bogey anterior
  if (overPar >= 2) return 'tilt'
  if (overPar >= 1 && prevOverPar >= 1) return 'tilt'

  // Tensión: bogey aislado
  if (overPar === 1) return 'tense'

  // Calma: par o mejor
  return 'calm'
}

function parForHole(round: RoundForAnalysis, i: number): number {
  return round.hole_pars?.[i] ?? STANDARD_PARS[i]
}

/**
 * Calcula todos los datos de la Costo Psicológico Card sobre UN SOLO universo
 * de rondas. Garantiza la invariante matemática:
 *
 *   evitables === windowSize × (promedioReal − promedioContenido)
 *
 * Antes (bug del 19-may reportado por Juanjo: "36 strokes evitables"):
 *   - `evitables` se calculaba sobre las últimas 8 rondas.
 *   - `promedioReal` / `promedioContenido` sobre las últimas 5 rondas.
 *   - Resultado: número grande (36) inflado vs. los promedios mostrados debajo
 *     (delta ~3.6 × 5 = 18). Card mezcla denominadores → usuarios confundidos.
 *
 * Hoy: TODO se calcula sobre las primeras `windowSize` rondas (por defecto 5).
 * El componente debe mostrar el `windowSize` como label real, no "30D".
 *
 * @param rounds Rondas ordenadas DESC por fecha (más recientes primero).
 * @param windowSize Cap superior. El universo real es `min(windowSize, rounds.length)`.
 */
export function calcularCostoPsicologico(
  rounds: RoundForCostoPsicologico[],
  windowSize = 5,
): CostoPsicologicoResult {
  const universo = rounds.slice(0, windowSize)
  const realWindowSize = universo.length

  if (realWindowSize === 0) {
    return {
      evitables: 0,
      promedioReal: 0,
      promedioContenido: 0,
      windowSize: 0,
      lastRound: null,
    }
  }

  // Strokes evitables y promedios: ambos sobre el MISMO universo.
  const evitablesResult = strokesEvitables(universo)
  const evitables = evitablesResult.total

  const promedioReal =
    universo.reduce((a, r) => a + (r.total_gross ?? 0), 0) / realWindowSize
  const promedioContenido = promedioReal - evitables / realWindowSize

  // Última ronda (la más reciente del universo) — solo si tuvo espirales.
  const last = universo[0]
  const lastInstance = evitablesResult.instances.find(i => i.round_id === last.id)
  const lastRound = lastInstance && last.total_gross != null
    ? {
        id: last.id,
        realScore: last.total_gross,
        ghostScore: last.total_gross - lastInstance.strokes_saved,
        strokes_saved: lastInstance.strokes_saved,
        holes: lastInstance.holes,
      }
    : null

  return {
    evitables,
    promedioReal,
    promedioContenido,
    windowSize: realWindowSize,
    lastRound,
  }
}

// Expose para tests
export const __testing__ = { parForHole, MENTAL_PATTERN_PENALTIES }
