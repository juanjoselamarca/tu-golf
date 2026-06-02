/**
 * Biblioteca de patrones de juego detectables.
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
  /** Si true, solo procesa rondas de 18 hoyos (ej. comparar front vs back).
   * Si false, acepta rondas de 9 tambien (ej. par_3_weakness, post_bogey_spiral). */
  requires18Holes: boolean
  detect: (rounds: PatternRound[]) => { detected: boolean; confidence: number; metadata?: Record<string, unknown> }
  severity: 'info' | 'warning' | 'critical'
  recommendation: string
}

export interface PatternRound {
  scores: (number | null)[]
  total_gross: number
  par_total: number
  course_name: string
  played_at: string
  /** Par por hoyo (18 elementos). Si se pasa, pisa STANDARD_PARS y detecta
   * patrones contra el par REAL de la cancha (para canchas par 70/71 o con
   * layouts no estándar). */
  hole_pars?: number[]
  metadata?: Record<string, unknown> | null
}

// Par layout estándar (par 72: P4/P3/P5 típico). Solo se usa cuando la ronda
// no trae el par real de la cancha en hole_pars.
const STANDARD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]

function parForHole(round: PatternRound, i: number): number {
  return round.hole_pars?.[i] ?? STANDARD_PARS[i]
}

export const PATTERNS: GolfPattern[] = [
  {
    id: 'back_nine_collapse',
    name: 'Caída en back nine',
    description: 'Back 9 promedio > front 9 en más de 2.5 strokes',
    requires18Holes: true,
    severity: 'warning',
    recommendation: 'Gestión de energía: hidratación, snack en hoyo 10, reset_4_pasos antes del back nine',
    detect(rounds) {
      let front9Sum = 0, front9Count = 0, back9Sum = 0, back9Count = 0
      for (const r of rounds) {
        if (!Array.isArray(r.scores)) continue
        for (let i = 0; i < Math.min(r.scores.length, 18); i++) {
          const s = r.scores[i]
          if (s == null) continue
          if (i < 9) { front9Sum += s; front9Count++ }
          else { back9Sum += s; back9Count++ }
        }
      }
      const front9Avg = front9Count > 0 ? (front9Sum / front9Count) * 9 : null
      const back9Avg = back9Count > 0 ? (back9Sum / back9Count) * 9 : null
      if (front9Avg == null || back9Avg == null) return { detected: false, confidence: 0 }
      const diff = back9Avg - front9Avg
      if (diff <= 2.5) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.5 + (diff - 2.5) * 0.1) * 100) / 100, 0.95),
        metadata: { front9_avg: Math.round(front9Avg * 10) / 10, back9_avg: Math.round(back9Avg * 10) / 10, diff: Math.round(diff * 10) / 10 },
      }
    },
  },
  {
    id: 'front_nine_struggles',
    name: 'Arranque lento',
    description: 'Front 9 promedio > back 9 en más de 2.5 strokes',
    requires18Holes: true,
    severity: 'warning',
    recommendation: 'Rutina pre-ronda: 15 min putting green + breathing_4_4_6 antes del primer tee',
    detect(rounds) {
      let front9Sum = 0, front9Count = 0, back9Sum = 0, back9Count = 0
      for (const r of rounds) {
        if (!Array.isArray(r.scores)) continue
        for (let i = 0; i < Math.min(r.scores.length, 18); i++) {
          const s = r.scores[i]
          if (s == null) continue
          if (i < 9) { front9Sum += s; front9Count++ }
          else { back9Sum += s; back9Count++ }
        }
      }
      const front9Avg = front9Count > 0 ? (front9Sum / front9Count) * 9 : null
      const back9Avg = back9Count > 0 ? (back9Sum / back9Count) * 9 : null
      if (front9Avg == null || back9Avg == null) return { detected: false, confidence: 0 }
      const diff = front9Avg - back9Avg
      if (diff <= 2.5) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.5 + (diff - 2.5) * 0.1) * 100) / 100, 0.95),
        metadata: { front9_avg: Math.round(front9Avg * 10) / 10, back9_avg: Math.round(back9Avg * 10) / 10, diff: Math.round(diff * 10) / 10 },
      }
    },
  },
  {
    id: 'first_hole_anxiety',
    name: 'Ansiedad en hoyo 1',
    description: 'Score promedio en hoyo 1 > 1.3x el promedio del resto',
    requires18Holes: false,
    severity: 'warning',
    recommendation: 'identity_anchor + think_box antes del primer tee. El hoyo 1 no define tu ronda.',
    detect(rounds) {
      const holeTotals: number[] = Array(18).fill(0)
      const holeCounts: number[] = Array(18).fill(0)
      for (const r of rounds) {
        if (!Array.isArray(r.scores)) continue
        for (let i = 0; i < Math.min(r.scores.length, 18); i++) {
          const s = r.scores[i]
          if (s == null) continue
          holeTotals[i] += s
          holeCounts[i]++
        }
      }
      if (holeCounts[0] < 3) return { detected: false, confidence: 0 }
      const hole1Avg = holeTotals[0] / holeCounts[0]
      const otherAvgs = holeTotals.slice(1).map((t, i) => holeCounts[i + 1] > 0 ? t / holeCounts[i + 1] : null).filter((v): v is number => v != null)
      if (otherAvgs.length === 0) return { detected: false, confidence: 0 }
      const othersAvg = otherAvgs.reduce((a, b) => a + b, 0) / otherAvgs.length
      if (hole1Avg <= othersAvg * 1.3) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.4 + (hole1Avg / othersAvg - 1.3) * 0.5) * 100) / 100, 0.9),
        metadata: { hole1_avg: Math.round(hole1Avg * 100) / 100, others_avg: Math.round(othersAvg * 100) / 100 },
      }
    },
  },
  {
    id: 'par_3_weakness',
    name: 'Debilidad en par 3',
    description: 'Promedio sobre par en hoyos par 3 > 1.2 y peor que el resto',
    requires18Holes: false,
    severity: 'info',
    recommendation: 'Práctica deliberada con hierros largos. Foco en distancia de carry, no en resultado.',
    detect(rounds) {
      let par3Total = 0, par3Count = 0, otherTotal = 0, otherCount = 0
      for (const r of rounds) {
        if (!Array.isArray(r.scores)) continue
        for (let i = 0; i < Math.min(r.scores.length, 18); i++) {
          const s = r.scores[i]
          if (s == null) continue
          const par = parForHole(r, i)
          const overPar = s - par
          if (par === 3) { par3Total += overPar; par3Count++ }
          else { otherTotal += overPar; otherCount++ }
        }
      }
      if (par3Count < 5 || otherCount < 5) return { detected: false, confidence: 0 }
      const par3AvgOver = par3Total / par3Count
      const otherAvgOver = otherTotal / otherCount
      if (par3AvgOver <= 1.2 || par3AvgOver <= otherAvgOver + 0.3) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.5 + (par3AvgOver - 1.2) * 0.15) * 100) / 100, 0.9),
        metadata: { par3_avg_over: Math.round(par3AvgOver * 100) / 100, other_avg_over: Math.round(otherAvgOver * 100) / 100 },
      }
    },
  },
  {
    id: 'short_game_weakness',
    name: 'Juego corto débil',
    description: 'Promedio sobre par en par 4 notablemente peor que en par 5',
    requires18Holes: false,
    severity: 'info',
    recommendation: 'Dedicar 60% de práctica a chipping y approach. Menos driver, más wedges.',
    detect(rounds) {
      let par4Total = 0, par4Count = 0, par5Total = 0, par5Count = 0
      for (const r of rounds) {
        if (!Array.isArray(r.scores)) continue
        for (let i = 0; i < Math.min(r.scores.length, 18); i++) {
          const s = r.scores[i]
          if (s == null) continue
          const par = parForHole(r, i)
          if (par === 4) { par4Total += (s - par); par4Count++ }
          if (par === 5) { par5Total += (s - par); par5Count++ }
        }
      }
      if (par4Count < 5 || par5Count < 5) return { detected: false, confidence: 0 }
      const par4AvgOver = par4Total / par4Count
      const par5AvgOver = par5Total / par5Count
      if (par4AvgOver <= par5AvgOver + 0.5 || par4AvgOver <= 1.0) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.45 + (par4AvgOver - par5AvgOver - 0.5) * 0.15) * 100) / 100, 0.9),
        metadata: { par4_avg_over: Math.round(par4AvgOver * 100) / 100, par5_avg_over: Math.round(par5AvgOver * 100) / 100 },
      }
    },
  },
  {
    id: 'post_bogey_spiral',
    name: 'Espiral post-bogey',
    description: '>40% de bogeys seguidos por otro bogey o peor',
    requires18Holes: false,
    severity: 'critical',
    recommendation: 'reset_4_pasos obligatorio después de cada bogey. next_shot_mentality — el hoyo anterior no existe.',
    detect(rounds) {
      let bogeyFollowedByBogey = 0, bogeyTotal = 0
      for (const r of rounds) {
        if (!Array.isArray(r.scores)) continue
        for (let i = 0; i < Math.min(r.scores.length, 18) - 1; i++) {
          const s = r.scores[i]
          const next = r.scores[i + 1]
          if (s == null || next == null) continue
          const par = parForHole(r, i)
          const nextPar = parForHole(r, i + 1)
          if (s >= par + 1) {
            bogeyTotal++
            if (next >= nextPar + 1) bogeyFollowedByBogey++
          }
        }
      }
      if (bogeyTotal < 10) return { detected: false, confidence: 0 }
      const spiralRate = bogeyFollowedByBogey / bogeyTotal
      if (spiralRate <= 0.4) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.4 + (spiralRate - 0.4) * 0.8) * 100) / 100, 0.9),
        metadata: { spiral_rate: Math.round(spiralRate * 100) / 100, bogey_count: bogeyTotal, followed_by_bogey: bogeyFollowedByBogey },
      }
    },
  },
  {
    id: 'three_putt_frequency',
    name: 'Frecuencia de three-putts',
    description: '>15% de greens con 3+ putts',
    requires18Holes: false,
    severity: 'warning',
    recommendation: 'Práctica de lag putting — distancia antes que dirección. Objetivo: 0 three-putts por ronda.',
    detect(rounds) {
      let threePutts = 0, totalGreens = 0
      for (const r of rounds) {
        const meta = r.metadata as Record<string, unknown> | null
        if (!meta) continue
        const putts = meta.putts as (number | null)[] | undefined
        if (!Array.isArray(putts)) continue
        for (const p of putts) {
          if (p == null) continue
          totalGreens++
          if (p >= 3) threePutts++
        }
      }
      if (totalGreens < 18) return { detected: false, confidence: 0 }
      const threePuttRate = threePutts / totalGreens
      if (threePuttRate <= 0.15) return { detected: false, confidence: 0 }
      return {
        detected: true,
        confidence: Math.min(Math.round((0.5 + (threePuttRate - 0.15) * 2) * 100) / 100, 0.95),
        metadata: { three_putt_rate: Math.round(threePuttRate * 100) / 100, three_putts: threePutts, total_greens: totalGreens },
      }
    },
  },
  {
    id: 'pressure_deterioration',
    name: 'Deterioro bajo presion (cierre)',
    description: 'Score promedio en ultimos 4 hoyos > resto + 1.5 strokes/hoyo, sobre rondas de 18',
    requires18Holes: true,
    severity: 'warning',
    recommendation: 'Trabajar rutina pre-shot extendida en los ultimos 4 hoyos. Respiracion cuadrada antes del 15.',
    detect(rounds) {
      const eligible = rounds.filter(r => Array.isArray(r.scores) && r.scores.filter(s => s != null).length === 18)
      if (eligible.length < 5) return { detected: false, confidence: 0 }
      let triggers = 0
      for (const r of eligible) {
        const scores = r.scores as number[]
        const last4 = scores.slice(14, 18)
        const rest = scores.slice(0, 14)
        const avgLast = last4.reduce((a, b) => a + b, 0) / 4
        const avgRest = rest.reduce((a, b) => a + b, 0) / 14
        if (avgLast - avgRest > 1.5) triggers++
      }
      const ratio = triggers / eligible.length
      if (ratio < 0.4) return { detected: false, confidence: ratio }
      return {
        detected: true,
        confidence: Math.min(0.95, 0.5 + ratio),
        metadata: { triggers, eligible_rounds: eligible.length, ratio: Math.round(ratio * 100) / 100 },
      }
    },
  },
  {
    id: 'driving_inconsistency',
    name: 'Alta dispersion total',
    description: 'Coeficiente de variacion de total_gross > 0.06 sobre ultimas 10 rondas',
    // Requiere 18h porque variance/cv sobre total_gross sólo es comparable
    // entre rondas del mismo hole count. Mezclar 9h con 18h infla cv artificialmente.
    requires18Holes: true,
    severity: 'info',
    // El motor SOLO ve el total_gross por ronda — no hay datos de palo/driver.
    // La recomendación NO debe atribuir la dispersión al driver (sería inventar
    // una causa que los datos no soportan). Habla de consistencia general.
    recommendation: 'Tus scores varían mucho de ronda a ronda. Trabajá una rutina pre-shot estable y enfocate en bajar los hoyos desastre (dobles+): la consistencia se gana evitando el golpe malo, no buscando el golpe perfecto.',
    detect(rounds) {
      const last10 = rounds.slice(-10).filter(r => typeof r.total_gross === 'number' && r.total_gross > 0)
      if (last10.length < 5) return { detected: false, confidence: 0 }
      const mean = last10.reduce((a, b) => a + b.total_gross, 0) / last10.length
      const variance = last10.reduce((a, b) => a + Math.pow(b.total_gross - mean, 2), 0) / last10.length
      const std = Math.sqrt(variance)
      const cv = mean > 0 ? std / mean : 0
      if (cv < 0.06) return { detected: false, confidence: Math.round(cv * 10 * 100) / 100 }
      return {
        detected: true,
        confidence: Math.min(0.95, Math.round(cv * 10 * 100) / 100),
        metadata: { cv: Math.round(cv * 1000) / 1000, mean: Math.round(mean), std: Math.round(std * 10) / 10, sample: last10.length },
      }
    },
  },
]

export function detectPatterns(rounds: PatternRound[]): Array<{ pattern: GolfPattern; confidence: number; metadata?: Record<string, unknown> }> {
  const results: Array<{ pattern: GolfPattern; confidence: number; metadata?: Record<string, unknown> }> = []
  for (const p of PATTERNS) {
    // Filtrar rondas elegibles segun el flag del patron.
    // requires18Holes: true → solo rondas con >=18 scores no nulos.
    // requires18Holes: false → todas las rondas (incluye 9 hoyos).
    const eligible = p.requires18Holes
      ? rounds.filter(r => Array.isArray(r.scores) && r.scores.filter(s => s != null).length >= 18)
      : rounds
    if (eligible.length === 0) continue
    const result = p.detect(eligible)
    if (result.detected) {
      results.push({ pattern: p, confidence: result.confidence, metadata: result.metadata })
    }
  }
  return results
}
