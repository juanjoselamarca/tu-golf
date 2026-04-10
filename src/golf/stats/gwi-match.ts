/**
 * GWI™ para Match Play — probabilidad de ganar un match en curso.
 *
 * Modelo: Cadena de Markov recursiva.
 * Estado = (holesUp, holesRemaining)
 * Transiciones por hoyo: win, halve, lose
 *
 * P(A gana | up=k, rem=n) =
 *   pWin  * P(A gana | k+1, n-1) +
 *   pHalve * P(A gana | k, n-1) +
 *   pLose * P(A gana | k-1, n-1)
 *
 * Las probabilidades por hoyo se estiman desde:
 * - Diferencia de handicap (ajustada por stroke index)
 * - Varianza histórica de ambos jugadores
 */

import { varianzaPorHoyo } from './gwi'

/** Capitaliza cada palabra: "juan ruiz" → "Juan Ruiz" */
function capitalize(name: string): string {
  return name.replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Types ───

export interface MatchGWIInput {
  nombreA: string
  nombreB: string
  handicapA: number
  handicapB: number
  /** Estado actual del match: positivo = A arriba */
  holesUp: number
  /** Hoyos que quedan por jugar */
  holesRemaining: number
  /** Historial de rondas de A (para varianza) */
  roundsCountA: number
  /** Historial de rondas de B (para varianza) */
  roundsCountB: number
}

export interface MatchGWIResult {
  probA: number    // 0-100
  probB: number    // 0-100
  probTie: number  // 0-100
  narrativa: string
}

// ─── Probabilidad de ganar un hoyo individual ───

/**
 * Estima P(A gana hoyo), P(halve), P(B gana hoyo) basado en
 * la diferencia de scoring esperado.
 *
 * Se usa un modelo normal simplificado:
 * - El score esperado de cada jugador en un hoyo depende de su handicap
 * - La varianza combina ambas varianzas individuales
 * - P(A gana) = P(scoreA < scoreB) con distribución normal
 */
function probHoyo(
  handicapA: number,
  handicapB: number,
  hcpDiff: number
): { pWinA: number; pHalve: number; pWinB: number } {
  // Expected strokes over par per hole
  const expectedOverA = handicapA / 18
  const expectedOverB = (handicapB - hcpDiff) / 18 // B ajustado por strokes que recibe

  // Varianza combinada
  const sigmaA = varianzaPorHoyo(handicapA)
  const sigmaB = varianzaPorHoyo(handicapB)
  const sigmaCombo = Math.sqrt(sigmaA ** 2 + sigmaB ** 2)

  if (sigmaCombo === 0) {
    // Ambos scratch con varianza 0 — poco realista pero manejamos
    const diff = expectedOverA - expectedOverB
    if (diff < 0) return { pWinA: 0.5, pHalve: 0.3, pWinB: 0.2 }
    if (diff > 0) return { pWinA: 0.2, pHalve: 0.3, pWinB: 0.5 }
    return { pWinA: 0.3, pHalve: 0.4, pWinB: 0.3 }
  }

  // Diferencia esperada: si positiva, B espera mejor score (A pierde)
  const diffExpected = expectedOverA - expectedOverB
  const zScore = diffExpected / sigmaCombo

  // P(A gana) ≈ P(diff < 0) usando CDF normal
  const pABetter = normalCDF(-zScore)
  const pBBetter = normalCDF(zScore)

  // Halve probability: zona muerta de ~0.5 stroke de diferencia
  const pHalveBase = Math.exp(-zScore * zScore) * 0.35
  const pHalve = Math.min(0.45, Math.max(0.15, pHalveBase))

  // Normalizar win probs
  const pWinRaw = pABetter * (1 - pHalve)
  const pLoseRaw = pBBetter * (1 - pHalve)
  const total = pWinRaw + pLoseRaw
  let pWinA = total > 0 ? pWinRaw / total * (1 - pHalve) : (1 - pHalve) / 2
  let pWinB = (1 - pHalve) - pWinA

  // Clamp + re-normalizar para garantizar suma = 1.0
  pWinA = Math.max(0.05, Math.min(0.80, pWinA))
  pWinB = Math.max(0.05, Math.min(0.80, pWinB))
  const sum = pWinA + pHalve + pWinB
  return {
    pWinA: pWinA / sum,
    pHalve: pHalve / sum,
    pWinB: pWinB / sum,
  }
}

// Normal CDF
function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)))
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t)
    + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}

// ─── Cadena de Markov recursiva ───

/**
 * Calcula P(A gana el match) desde el estado actual.
 * Usa memoización para eficiencia (max 18*37 estados ≈ 666).
 */
export function calcularGWIMatch(input: MatchGWIInput): MatchGWIResult {
  const { handicapA, handicapB, holesUp, holesRemaining } = input
  const hcpDiff = Math.abs(handicapA - handicapB)
  const { pWinA, pHalve, pWinB } = probHoyo(handicapA, handicapB, hcpDiff)

  // Memoización: cache[up_offset][remaining]
  // up va de -18 a +18, offset = up + 18
  const cache: Map<string, number> = new Map()

  function probAWins(up: number, rem: number): number {
    // Casos base
    if (up > rem) return 1    // A tiene ventaja insuperable
    if (-up > rem) return 0   // B tiene ventaja insuperable
    if (rem === 0) {
      if (up > 0) return 1    // A gana
      if (up < 0) return 0    // B gana
      return 0                // All Square = empate (no victoria de A)
    }

    const key = `${up}_${rem}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const result =
      pWinA  * probAWins(up + 1, rem - 1) +
      pHalve * probAWins(up, rem - 1) +
      pWinB  * probAWins(up - 1, rem - 1)

    cache.set(key, result)
    return result
  }

  function probTie(up: number, rem: number): number {
    if (Math.abs(up) > rem) return 0
    if (rem === 0) return up === 0 ? 1 : 0

    const key = `tie_${up}_${rem}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const result =
      pWinA  * probTie(up + 1, rem - 1) +
      pHalve * probTie(up, rem - 1) +
      pWinB  * probTie(up - 1, rem - 1)

    cache.set(key, result)
    return result
  }

  const pA = probAWins(holesUp, holesRemaining)
  const pTie = probTie(holesUp, holesRemaining)
  const pB = 1 - pA - pTie

  // Convertir a porcentajes
  const probA = Math.round(Math.max(0, Math.min(100, pA * 100)))
  const probTieRound = Math.round(Math.max(0, Math.min(100, pTie * 100)))
  const probB = Math.max(0, 100 - probA - probTieRound)

  // Narrativa
  let narrativa = ''
  if (holesRemaining === 0) {
    narrativa = holesUp > 0 ? `${capitalize(input.nombreA)} gana`
      : holesUp < 0 ? `${capitalize(input.nombreB)} gana`
      : 'All Square'
  } else if (holesUp > 0 && holesUp === holesRemaining) {
    narrativa = `${capitalize(input.nombreA)} está dormie`
  } else if (holesUp < 0 && -holesUp === holesRemaining) {
    narrativa = `${capitalize(input.nombreB)} está dormie`
  } else if (probA >= 90) {
    narrativa = `${capitalize(input.nombreA)} tiene el match casi asegurado`
  } else if (probB >= 90) {
    narrativa = `${capitalize(input.nombreB)} tiene el match casi asegurado`
  } else if (Math.abs(holesUp) <= 1 && holesRemaining <= 3) {
    narrativa = 'Match al rojo vivo en los últimos hoyos'
  } else if (probA >= 60) {
    narrativa = `${capitalize(input.nombreA)} lidera pero queda partido`
  } else if (probB >= 60) {
    narrativa = `${capitalize(input.nombreB)} lidera pero queda partido`
  } else {
    narrativa = 'Match abierto — cualquiera puede ganar'
  }

  return { probA, probB, probTie: probTieRound, narrativa }
}
