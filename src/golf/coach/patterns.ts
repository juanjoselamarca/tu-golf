/**
 * Biblioteca de patrones de juego — stub para desarrollo futuro.
 *
 * Cada patrón define: qué buscar en las rondas del jugador,
 * qué nivel de confianza tiene la detección, y qué recomendar.
 *
 * Para agregar un patrón nuevo:
 * 1. Definir el pattern con detect() y recommendation
 * 2. Agregar al array PATTERNS
 * 3. El motor de análisis lo detecta automáticamente
 */

export interface GolfPattern {
  id: string
  name: string
  description: string
  detect: (rounds: PatternRound[]) => { detected: boolean; confidence: number; metadata?: Record<string, unknown> }
  severity: 'info' | 'warning' | 'critical'
  recommendation: string
}

export interface PatternRound {
  scores: number[]
  total_gross: number
  par_total: number
  course_name: string
  played_at: string
}

// Patrones se agregarán aquí conforme el coach IA evolucione
export const PATTERNS: GolfPattern[] = []

export function detectPatterns(rounds: PatternRound[]): Array<{ pattern: GolfPattern; confidence: number; metadata?: Record<string, unknown> }> {
  const results: Array<{ pattern: GolfPattern; confidence: number; metadata?: Record<string, unknown> }> = []
  for (const p of PATTERNS) {
    const result = p.detect(rounds)
    if (result.detected) {
      results.push({ pattern: p, confidence: result.confidence, metadata: result.metadata })
    }
  }
  return results
}
