/**
 * Motor de análisis de rondas para tAIger+.
 * Genera insights concretos a partir de los scores de una ronda.
 */

import { STANDARD_PARS } from '@/golf/coach/hole-pars'

export interface RoundAnalysis {
  summary: string
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  keyHoles: Array<{ hole: number; observation: string }>
}

export function analyzeRound(scores: number[], holeParsInput?: number[]): RoundAnalysis {
  const holePars = holeParsInput ?? STANDARD_PARS.slice(0, scores.length)
  if (scores.length === 0) {
    return { summary: '', strengths: [], weaknesses: [], recommendations: [], keyHoles: [] }
  }

  // Solo cuentan los hoyos efectivamente jugados (score > 0).
  // Regla del golf: vsPar se mide contra el par de los hoyos jugados,
  // no contra el par total del recorrido si la ronda fue parcial.
  let total = 0
  let parTotal = 0
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > 0) {
      total += scores[i]
      parTotal += holePars[i] ?? STANDARD_PARS[i]
    }
  }
  const vsPar = total - parTotal

  let birdies = 0, parCount = 0, bogeys = 0, doubles = 0
  const keyHoles: RoundAnalysis['keyHoles'] = []

  for (let i = 0; i < scores.length; i++) {
    const diff = scores[i] - holePars[i]
    if (diff <= -2) {
      keyHoles.push({ hole: i + 1, observation: `Eagle o mejor (${diff})` })
    } else if (diff === -1) {
      birdies++
    } else if (diff === 0) {
      parCount++
    } else if (diff === 1) {
      bogeys++
    } else {
      doubles++
      keyHoles.push({ hole: i + 1, observation: `Doble bogey+ (+${diff})` })
    }
  }

  // Detect momentum shifts
  const front9 = scores.slice(0, 9).reduce((a, b) => a + b, 0)
  const front9Par = holePars.slice(0, 9).reduce((a, b) => a + b, 0)
  const back9 = scores.length > 9 ? scores.slice(9).reduce((a, b) => a + b, 0) : null
  const back9Par = scores.length > 9 ? holePars.slice(9).reduce((a, b) => a + b, 0) : null

  const strengths: string[] = []
  const weaknesses: string[] = []
  const recommendations: string[] = []

  if (birdies >= 3) strengths.push(`${birdies} birdies — agresividad efectiva`)
  if (parCount >= scores.length * 0.5) strengths.push(`${parCount} pares — consistencia sólida`)
  if (back9 != null && back9Par != null && front9 - front9Par > (back9 - back9Par) + 2) {
    strengths.push('Mejora notable en back nine — buena gestión mental')
  }

  if (doubles >= 3) weaknesses.push(`${doubles} doble bogeys+ — hoyos costosos`)
  if (back9 != null && back9Par != null && (back9 - back9Par) > (front9 - front9Par) + 2) {
    weaknesses.push('Caída en back nine — posible fatiga o pérdida de concentración')
    recommendations.push('Gestión de energía: hidratación y snack entre hoyo 9 y 10')
  }

  // Post-bogey analysis
  let bogeyFollowed = 0, bogeyCount = 0
  for (let i = 0; i < scores.length - 1; i++) {
    if (scores[i] - holePars[i] >= 1) {
      bogeyCount++
      if (scores[i + 1] - holePars[i + 1] >= 1) bogeyFollowed++
    }
  }
  if (bogeyCount >= 3 && bogeyFollowed / bogeyCount > 0.5) {
    weaknesses.push('Espiral post-bogey — dificultad para resetear')
    recommendations.push('reset_4_pasos después de cada bogey: exhalar, paso atrás, ancla, nueva rutina')
  }

  const vsParStr = vsPar > 0 ? `+${vsPar}` : vsPar === 0 ? 'E' : String(vsPar)
  const summary = `${total} (${vsParStr}) — ${birdies}B ${parCount}P ${bogeys}Bo ${doubles}D+`

  return { summary, strengths, weaknesses, recommendations, keyHoles }
}
