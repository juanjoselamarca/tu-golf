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

// Implementations siguen en tasks 3-5
export function calcularMentalIndex(_input: MentalIndexInput): MentalIndexResult {
  throw new Error('not implemented')
}

export function strokesEvitables(_rounds: RoundForAnalysis[]): StrokesEvitablesResult {
  throw new Error('not implemented')
}

export function clasificarHoyo(_round: RoundForAnalysis, _i: number): MentalState | null {
  throw new Error('not implemented')
}

function parForHole(round: RoundForAnalysis, i: number): number {
  return round.hole_pars?.[i] ?? STANDARD_PARS[i]
}

// Expose para tests
export const __testing__ = { parForHole, MENTAL_PATTERN_PENALTIES }
