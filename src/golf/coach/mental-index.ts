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
  instances: Array<{ round_id: string; holes: string[] }>
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
    const consistenciaNorm = input.cpi.breakdown.consistencia / 25
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
  const instances: Array<{ round_id: string; holes: string[] }> = []

  for (const r of rounds) {
    if (!Array.isArray(r.scores)) continue
    const holes: string[] = []

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
          holes.push(`H${i + 1}→H${i + 2}`)
        }
      }
    }

    if (holes.length) instances.push({ round_id: r.id, holes })
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

// Expose para tests
export const __testing__ = { parForHole, MENTAL_PATTERN_PENALTIES }
