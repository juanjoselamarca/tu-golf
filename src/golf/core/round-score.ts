/**
 * src/golf/core/round-score.ts
 *
 * ÚNICA fuente de verdad para el cálculo de score de una ronda.
 *
 * NUNCA asumas par 72. NUNCA asumas 18 hoyos. Respeta siempre roundHoles.
 *
 * Motivo: bug reportado donde un jugador con +11 en 9 hoyos se mostraba
 * como 83 golpes (72+11) en vez de 47 (36+11). Este helper centraliza
 * la lógica correcta para que no se repita en varios archivos.
 */

/**
 * Calcula el score de una ronda considerando correctamente los hoyos jugados.
 * Esta es la ÚNICA fuente de verdad para cálculos de score de ronda.
 *
 * NUNCA asumas par 72. NUNCA asumas 18 hoyos. Respeta siempre roundHoles.
 */
export interface RoundScoreInput {
  scores: Record<string, number> | Record<number, number>
  roundHoles: number // 9 o 18 — cantidad de hoyos de la ronda
  parMap: Record<number, number> // par por hoyo (1..roundHoles)
}

export interface RoundScoreResult {
  gross: number // total de golpes en los hoyos jugados
  vsPar: number // vs par solamente de los hoyos jugados
  holesPlayed: number // cantidad de hoyos con score registrado (<=roundHoles)
  parJugado: number // suma de pares de los hoyos ya jugados
  parTotalRonda: number // suma de pares de TODOS los hoyos de la ronda (1..roundHoles)
}

function getScore(
  scores: Record<string, number> | Record<number, number>,
  hole: number
): number | undefined {
  const asNum = (scores as Record<number, number>)[hole]
  if (typeof asNum === 'number' && Number.isFinite(asNum)) return asNum
  const asStr = (scores as Record<string, number>)[String(hole)]
  if (typeof asStr === 'number' && Number.isFinite(asStr)) return asStr
  return undefined
}

export function calcularScoreRonda(input: RoundScoreInput): RoundScoreResult {
  const { scores, roundHoles, parMap } = input

  let gross = 0
  let parJugado = 0
  let parTotalRonda = 0
  let holesPlayed = 0

  for (let hole = 1; hole <= roundHoles; hole++) {
    const par = parMap[hole] ?? 4
    parTotalRonda += par

    const score = getScore(scores, hole)
    if (typeof score === 'number' && score > 0) {
      gross += score
      parJugado += par
      holesPlayed += 1
    }
  }

  const vsPar = gross - parJugado

  return {
    gross,
    vsPar,
    holesPlayed,
    parJugado,
    parTotalRonda,
  }
}

/**
 * Versión simplificada cuando solo se sabe vsPar (desde DB) y cantidad de hoyos.
 * Usa par estándar: 36 para 9 hoyos, 72 para 18.
 */
export function parTotalEstandar(roundHoles: number): number {
  if (roundHoles <= 9) return 36
  if (roundHoles <= 18) return 72
  return Math.round(roundHoles * 4) // fallback proporcional
}
