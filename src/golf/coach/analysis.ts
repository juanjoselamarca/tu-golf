/**
 * Motor de análisis de rondas — stub para desarrollo futuro.
 *
 * Analiza una ronda completa y genera insights para tAIger+.
 */

export interface RoundAnalysis {
  summary: string
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  keyHoles: Array<{ hole: number; observation: string }>
}

export function analyzeRound(_scores: number[], _pars: number[]): RoundAnalysis {
  return {
    summary: '',
    strengths: [],
    weaknesses: [],
    recommendations: [],
    keyHoles: [],
  }
}
