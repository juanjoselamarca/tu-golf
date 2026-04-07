/**
 * CPI — Competitive Performance Index
 * Golfers+
 *
 * Índice propietario que mide el rendimiento competitivo de un golfista.
 * Escala: 0–100 (mayor = mejor).
 *
 * Factores:
 *  - Diferencial promedio (ponderado por recencia)
 *  - Consistencia (desviación estándar de diferenciales)
 *  - Tendencia (mejora o empeoramiento)
 *  - Volumen de rondas (penalización si pocas rondas)
 */

import type { ImportRoundData, ImportIssue } from '@/lib/import-types'

// ── Import Round Validation ───────────────────────────────────

/**
 * Valida una ronda importada (screenshot/CSV) y retorna issues.
 */
export function validarRonda(round: ImportRoundData): {
  valid: boolean
  holesPlayed: number
  issues: ImportIssue[]
} {
  const issues: ImportIssue[] = []
  const scores = round.scores
  const holeKeys = Object.keys(scores).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
  const holesPlayed = holeKeys.length

  if (holesPlayed !== 9 && holesPlayed !== 18) {
    issues.push({
      type: 'incomplete_round',
      message: `Se detectaron ${holesPlayed} hoyos — se esperan 9 o 18`,
      canFix: false,
    })
  }

  for (const hole of holeKeys) {
    const score = scores[String(hole)]
    if (score == null || score === 0) {
      issues.push({
        type: 'missing_score',
        holeNumber: hole,
        message: `Hoyo ${hole}: score faltante o cero`,
        canFix: true,
      })
    } else if (score < 1 || score > 20) {
      issues.push({
        type: 'score_out_of_range',
        holeNumber: hole,
        message: `Hoyo ${hole}: score ${score} fuera de rango (1-20)`,
        canFix: true,
      })
    }
  }

  const sum = holeKeys.reduce((acc, h) => acc + (scores[String(h)] || 0), 0)
  if (round.total_gross > 0 && Math.abs(round.total_gross - sum) > 1) {
    issues.push({
      type: 'incomplete_round',
      message: `Total (${round.total_gross}) no coincide con suma de scores (${sum})`,
      canFix: true,
    })
  }

  const valid = issues.filter(i => !i.canFix).length === 0 &&
    issues.filter(i => i.type === 'missing_score').length === 0

  return { valid, holesPlayed, issues }
}

// ── Types ─────────────────────────────────────────────────────

export interface RondaCPI {
  played_at: string
  total_gross: number
  course_rating: number | null
  slope_rating: number | null
}

export interface ResultadoCPI {
  score: number          // 0–100
  trend: number          // positivo = mejorando
  status: 'insufficient_data' | 'provisional' | 'established'
  breakdown: {
    diferencial_avg: number
    consistencia: number
    tendencia: number
    volumen_factor: number
  }
  rondas_usadas: number
}

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_COURSE_RATING = 72
const DEFAULT_SLOPE = 113
const MIN_RONDAS = 3
const RONDAS_PROVISIONAL = 10
const MAX_RONDAS = 20        // usar las últimas 20

// ── Helpers ───────────────────────────────────────────────────

function calcularDiferencial(gross: number, cr: number, slope: number): number {
  return ((gross - cr) * 113) / slope
}

function validarRondaCPI(r: RondaCPI): boolean {
  const s = r.total_gross
  return typeof s === 'number' && s >= 1 && !isNaN(s)
}

function pesoRecencia(index: number, total: number): number {
  // La ronda más reciente (index 0) pesa más
  const ratio = 1 - index / total
  return 0.5 + 0.5 * ratio  // rango: 0.5 – 1.0
}

function promedioPonderado(valores: number[], pesos: number[]): number {
  let sumProd = 0
  let sumPesos = 0
  for (let i = 0; i < valores.length; i++) {
    sumProd += valores[i] * pesos[i]
    sumPesos += pesos[i]
  }
  return sumProd / sumPesos
}

function desviacionEstandar(valores: number[]): number {
  const avg = valores.reduce((a, b) => a + b, 0) / valores.length
  const sqDiffs = valores.map(v => (v - avg) ** 2)
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / valores.length)
}

// ── Main ──────────────────────────────────────────────────────

/**
 * Retorna la etiqueta de nivel según el score CPI.
 */
export function nivelCPI(score: number): string {
  if (score >= 90) return 'Elite'
  if (score >= 75) return 'Avanzado'
  if (score >= 55) return 'Intermedio'
  if (score >= 35) return 'En desarrollo'
  if (score >= 15) return 'Principiante'
  return 'Sin clasificar'
}

export function calcularCPI(rondas: RondaCPI[]): ResultadoCPI {
  // Filtrar y ordenar (más recientes primero)
  const validas = rondas
    .filter(validarRondaCPI)
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .slice(0, MAX_RONDAS)

  if (validas.length < MIN_RONDAS) {
    return {
      score: 0,
      trend: 0,
      status: 'insufficient_data',
      breakdown: { diferencial_avg: 0, consistencia: 0, tendencia: 0, volumen_factor: 0 },
      rondas_usadas: validas.length,
    }
  }

  // ── Calcular diferenciales ────────────────────────────────
  const diferenciales = validas.map(r => {
    const cr = r.course_rating ?? DEFAULT_COURSE_RATING
    const slope = r.slope_rating ?? DEFAULT_SLOPE
    return calcularDiferencial(r.total_gross, cr, slope)
  })

  // ── 1. Diferencial promedio ponderado ─────────────────────
  const pesos = diferenciales.map((_, i) => pesoRecencia(i, diferenciales.length))
  const difAvg = promedioPonderado(diferenciales, pesos)

  // ── 2. Consistencia ───────────────────────────────────────
  const stdDev = desviacionEstandar(diferenciales)
  // Menor stdDev = más consistente = mejor score
  // Mapear: stdDev 0 → 25pts, stdDev 10+ → 0pts
  const consistencia = Math.max(0, 25 * (1 - stdDev / 10))

  // ── 3. Tendencia ──────────────────────────────────────────
  // Comparar primera mitad vs segunda mitad de diferenciales
  const mitad = Math.floor(diferenciales.length / 2)
  const recientes = diferenciales.slice(0, mitad)
  const antiguas = diferenciales.slice(mitad)
  const avgRecientes = recientes.reduce((a, b) => a + b, 0) / recientes.length
  const avgAntiguas = antiguas.reduce((a, b) => a + b, 0) / antiguas.length
  const tendenciaRaw = avgAntiguas - avgRecientes  // positivo = mejorando
  // Mapear: -5 → 0pts, 0 → 10pts, +5 → 20pts
  const tendencia = Math.max(0, Math.min(20, 10 + tendenciaRaw * 2))

  // ── 4. Volumen ────────────────────────────────────────────
  // Penalizar si pocas rondas
  const volumenFactor = Math.min(1, validas.length / RONDAS_PROVISIONAL)

  // ── Score base: mapear diferencial a 0–55 ─────────────────
  // Diferencial 0 (scratch) → 55pts
  // Diferencial 36 (bogey golfer) → 0pts
  const scoreBase = Math.max(0, Math.min(55, 55 * (1 - difAvg / 36)))

  // ── Score final ───────────────────────────────────────────
  const rawScore = (scoreBase + consistencia + tendencia) * volumenFactor
  const score = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100

  const status = validas.length >= RONDAS_PROVISIONAL ? 'established' : 'provisional'

  return {
    score,
    trend: Math.round(tendenciaRaw * 1000) / 1000,
    status,
    breakdown: {
      diferencial_avg: Math.round(difAvg * 100) / 100,
      consistencia: Math.round(consistencia * 100) / 100,
      tendencia: Math.round(tendencia * 100) / 100,
      volumen_factor: Math.round(volumenFactor * 100) / 100,
    },
    rondas_usadas: validas.length,
  }
}
