/**
 * src/golf/core/ajuste-whs.ts
 *
 * FUENTE ÚNICA de "golpes de un hoyo para fines de handicap" cuando el hoyo no
 * se terminó (WHS 2024, Reglas de Handicapping 3.2 y 3.3). La tarjeta del MATCH
 * y la tarjeta del ÍNDICE son cosas distintas: conceder es perder el hoyo en el
 * match, siempre; para el índice el hoyo necesita un score. Antes no existía este
 * concepto y el CONCEDE (-1) entraba crudo al historial: restaba un golpe al total
 * y bajaba el diferencial.
 *
 * Reglas (decisión de producto 02-oct-2026, verificada contra WHS 2024):
 *   - Hoyo empezado y no terminado (el jugador CONCEDIÓ) → Regla 3.3, "score más
 *     probable", con techo en el máximo de la Regla 3.1 (doble bogey neto). La
 *     estimación automática es min(doble bogey neto, neto del rival en el hoyo + 1),
 *     llevada a golpes brutos del jugador: si el rival hizo birdie y el jugador
 *     concedió con un putt para par, el score más probable es par.
 *   - Hoyo GANADO sin terminar (el rival concedió y el jugador no anotó golpes) →
 *     par neto.
 *   - Hoyos sin jugar porque el match se decidió antes (4&3) → par neto. WHS 2024
 *     cambió el default de la Regla 3.2 a "expected score" (función del índice), pero
 *     mantiene el par neto a criterio del Comité; la fórmula del expected score no
 *     está publicada por USGA/R&A, y el par neto sí es exacto y verificable.
 *   - Jugador sin índice → máximo par + 5 (Regla 3.1b), sin golpes recibidos.
 * Un score anotado por el jugador SIEMPRE manda: nunca se pisa.
 */

import { CONCEDE } from '../formats/match-play'
import { strokesRecibidosEnHoyo } from './stableford-score'

/** Regla 3.1b: sin Handicap Index, el máximo por hoyo es par + 5. */
export const TOPE_SIN_INDICE_SOBRE_PAR = 5

export type MotivoEstimado = 'concedido' | 'ganado_sin_terminar' | 'no_jugado'

export interface HoyoEstimado {
  hoyo: number
  motivo: MotivoEstimado
}

/** Máximo por hoyo para el índice (Regla 3.1): doble bogey neto, o par + 5 sin índice. */
export function maximoPorHoyo(par: number, golpesRecibidos: number | null): number {
  return golpesRecibidos == null ? par + TOPE_SIN_INDICE_SOBRE_PAR : par + 2 + golpesRecibidos
}

/** Par neto en golpes brutos: par + golpes recibidos (sin índice: par). */
export function parNeto(par: number, golpesRecibidos: number | null): number {
  return par + (golpesRecibidos ?? 0)
}

/**
 * Score más probable de un hoyo concedido, en golpes brutos del jugador:
 * min(máximo por hoyo, neto del rival + 1) llevado a bruto. Sin score válido del
 * rival (no anotó o también concedió) queda el máximo. Nunca menos de 1 golpe.
 */
export function estimarHoyoConcedido(input: {
  par: number
  /** Golpes que recibe el jugador en el hoyo; `null` si no tiene índice. */
  golpesRecibidos: number | null
  rival?: { gross: number | null | undefined; golpesRecibidos: number } | null
}): number {
  const { par, golpesRecibidos, rival } = input
  const maximo = maximoPorHoyo(par, golpesRecibidos)
  const grossRival = rival?.gross
  if (typeof grossRival !== 'number' || !Number.isFinite(grossRival) || grossRival < 1) return maximo
  const netoObjetivo = grossRival - rival!.golpesRecibidos + 1
  return Math.max(1, Math.min(maximo, netoObjetivo + (golpesRecibidos ?? 0)))
}

type Tarjeta = Record<string | number, number | null | undefined>

function golpesEn(scores: Tarjeta | undefined, hoyo: number): number | undefined {
  if (!scores) return undefined
  const v = scores[hoyo] ?? scores[String(hoyo)]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Tarjeta lista para el historial: reemplaza cada hoyo concedido por su score más
 * probable y completa con par neto los hoyos ganados sin terminar y los que no se
 * jugaron porque el match terminó antes. Un score anotado (≥ 1) nunca se toca.
 * Cualquier otro valor no positivo se descarta (no es un score). No muta el input.
 *
 * `siPorHoyo` debe ser el SI NORMALIZADO de la ronda (permutación 1..N, el mismo
 * que reparte golpes en el scoring) y `courseHcp` el course handicap COMPLETO del
 * jugador para esos hoyos (no la diferencia del match: el índice es individual).
 */
export function ajustarTarjetaParaHistorial(input: {
  scores: Tarjeta
  /** Hoyos de la ronda (cualquier orden). */
  hoyos: readonly number[]
  parMap: Record<number, number>
  siPorHoyo: Record<number, number>
  /** Course handicap del jugador; `null` = sin índice (Regla 3.1b). */
  courseHcp: number | null
  totalHoyos: number
  rival?: { scores: Tarjeta; courseHcp: number } | null
  /** Hoyos que no se jugaron porque el match ya estaba decidido. */
  hoyosNoJugados?: readonly number[]
}): { scores: Record<number, number>; estimados: HoyoEstimado[] } {
  const { hoyos, parMap, siPorHoyo, courseHcp, totalHoyos, rival } = input
  const noJugados = new Set(input.hoyosNoJugados ?? [])
  const scores: Record<number, number> = {}
  const estimados: HoyoEstimado[] = []

  for (const [k, v] of Object.entries(input.scores)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) scores[Number(k)] = v
  }

  for (const hoyo of hoyos) {
    const propio = golpesEn(input.scores, hoyo)
    if (propio != null && propio >= 1) continue
    const par = parMap[hoyo]
    if (typeof par !== 'number' || !Number.isFinite(par)) continue
    const si = siPorHoyo[hoyo] ?? hoyo
    const golpes = courseHcp == null ? null : strokesRecibidosEnHoyo(courseHcp, si, totalHoyos)

    if (propio === CONCEDE) {
      const grossRival = golpesEn(rival?.scores, hoyo)
      scores[hoyo] = estimarHoyoConcedido({
        par,
        golpesRecibidos: golpes,
        rival: rival ? { gross: grossRival, golpesRecibidos: strokesRecibidosEnHoyo(rival.courseHcp, si, totalHoyos) } : null,
      })
      estimados.push({ hoyo, motivo: 'concedido' })
    } else if (golpesEn(rival?.scores, hoyo) === CONCEDE) {
      scores[hoyo] = parNeto(par, golpes)
      estimados.push({ hoyo, motivo: 'ganado_sin_terminar' })
    } else if (noJugados.has(hoyo)) {
      scores[hoyo] = parNeto(par, golpes)
      estimados.push({ hoyo, motivo: 'no_jugado' })
    }
  }
  estimados.sort((a, b) => a.hoyo - b.hoyo)
  return { scores, estimados }
}
