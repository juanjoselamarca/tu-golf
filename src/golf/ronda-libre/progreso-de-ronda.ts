/**
 * src/golf/ronda-libre/progreso-de-ronda.ts
 *
 * FUENTE ÚNICA de las preguntas de "¿cómo va la ronda?" que los dos scorers
 * de ronda libre (individual y de grupo/admin) contestaban cada uno por su
 * lado, con loops casi iguales:
 *   - ¿cuántos hoyos de la ronda llevan score?
 *   - ¿ya se puede finalizar? (desde el hoyo 9, o parado en el último)
 *   - total bruto / vs par / OUT / IN de una tarjeta
 *   - racha de hoyos en par o mejor (celebración del scorer individual)
 *
 * Puro: sin React, sin Supabase. Recorre SIEMPRE los hoyos de la ronda
 * (`hoyosDeLaRonda`), nunca 1..N: una ronda de 9 desde el 10 vive en 10..18.
 */

import { calcularScoreRonda } from '@/golf/core/round-score'
import { scoreDelHoyo, type ScoresDeTarjeta } from './tarjeta-historica'

/**
 * Desde cuántos hoyos anotados se ofrece "Finalizar ronda". Antes de eso la
 * tarjeta es demasiado corta para guardarse (WHS tampoco la acepta).
 */
export const MIN_HOYOS_PARA_FINALIZAR = 9

/** ¿Se ofrece el botón de finalizar? Desde el hoyo 9, o parado en el último. */
export function puedeFinalizar(hoyosAnotados: number, esUltimoHoyo: boolean): boolean {
  return hoyosAnotados >= MIN_HOYOS_PARA_FINALIZAR || esUltimoHoyo
}

/** Cuántos hoyos DE LA RONDA tienen score (acepta claves numéricas o string). */
export function hoyosAnotados(scores: ScoresDeTarjeta | null | undefined, hoyos: readonly number[]): number {
  if (!scores) return 0
  let n = 0
  for (const h of hoyos) if (scoreDelHoyo(scores, h) != null) n++
  return n
}

export interface TotalesDeTarjeta {
  gross: number
  vsPar: number
  /** Golpes en los hoyos 1..9 jugados (una ronda desde el 10 tiene OUT = 0). */
  out: number
  /** Golpes en los hoyos 10..18 jugados. */
  inn: number
  holesPlayed: number
  parJugado: number
}

/**
 * Totales de una tarjeta sobre los hoyos de la ronda. El bruto y el vs par
 * salen de `calcularScoreRonda` (fuente única del score de ronda); acá sólo
 * se agrega el desglose OUT/IN por NÚMERO de hoyo.
 */
export function totalesDeTarjeta(
  scores: ScoresDeTarjeta | null | undefined,
  hoyos: readonly number[],
  parMap: Record<number, number>,
): TotalesDeTarjeta {
  const base = calcularScoreRonda({
    scores: (scores ?? {}) as Record<string, number>,
    roundHoles: hoyos.length,
    parMap,
    hoyos,
  })
  let out = 0, inn = 0
  for (const h of hoyos) {
    const s = scoreDelHoyo(scores ?? {}, h)
    if (s == null || s <= 0) continue
    if (h <= 9) out += s
    else inn += s
  }
  return { gross: base.gross, vsPar: base.vsPar, out, inn, holesPlayed: base.holesPlayed, parJugado: base.parJugado }
}

/**
 * Racha de hoyos consecutivos en par o mejor, contando hacia atrás desde la
 * posición `desdeIdx` de `hoyos` (el hoyo recién anotado). Se corta en el
 * primer hoyo sin score o sobre par.
 */
export function rachaParOMejor(
  scores: ScoresDeTarjeta | null | undefined,
  hoyos: readonly number[],
  desdeIdx: number,
  parMap: Record<number, number>,
): number {
  let racha = 0
  for (let i = desdeIdx; i >= 0; i--) {
    const h = hoyos[i]
    const s = scoreDelHoyo(scores ?? {}, h)
    const p = parMap[h] ?? 4
    if (s != null && s <= p) racha++
    else break
  }
  return racha
}
