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

/* ── Adjusted Gross Score (WHS 2024, Regla 3.1) — issue #545 ─────────────── */

/**
 * De dónde salió el SI con el que se reparten los golpes del tope:
 *   - `catalogo`: hoyos de la ronda conocidos y SI del catálogo (normalizado 1..N).
 *   - `front_asumido`: tarjeta de 9 sin `metadata.hoyos`; se supone el front, así
 *     que el SI no es confiable y se usa el tope holgado.
 *   - `desconocido`: sin catálogo, catálogo ambiguo (varios recorridos) o hoyos
 *     rellenados sin dato: tope holgado.
 */
export type FuenteSI = 'catalogo' | 'front_asumido' | 'desconocido'

export interface GrossAjustadoInput {
  /** Golpes por número REAL de hoyo (claves número o string). Sólo cuentan los ≥ 1. */
  scores: Record<string | number, number | null | undefined>
  /** Hoyos de la tarjeta (los de la ronda, no sólo los jugados): su cantidad reparte los golpes. */
  hoyos: readonly number[]
  parPorHoyo: Record<number, number | null | undefined>
  /** SI NORMALIZADO 1..N por número de hoyo; `null` = no confiable → tope holgado. */
  siPorHoyo: Record<number, number> | null
  /** Course handicap para ESTOS hoyos (9 hoyos → CH de 9); `null` = sin índice (Regla 3.1a). */
  courseHcp: number | null
}

export interface GrossAjustadoResult {
  grossBruto: number
  grossAjustado: number
  hoyosTopados: Array<{ hoyo: number; gross: number; tope: number }>
  /** Hoyos jugados sin par conocido: no se topan (no se inventa par). */
  hoyosSinPar: number[]
  /** `false` si algún hoyo jugado quedó sin topar por falta de par. */
  completo: boolean
}

/**
 * Tope cuando no se sabe qué SI tiene el hoyo: el máximo de golpes que el jugador
 * puede recibir en CUALQUIER hoyo, `ceil(CH / N)`. Nunca es menor que el tope real
 * de ningún hoyo, así que el índice nunca sale más bajo que el oficial; a lo más,
 * un poco más alto. Sin índice: par + 5 (Regla 3.1a).
 */
export function topeHolgado(par: number, courseHcp: number | null, totalHoyos: number): number {
  if (courseHcp == null) return par + TOPE_SIN_INDICE_SOBRE_PAR
  const n = Math.max(1, totalHoyos)
  return par + 2 + Math.max(0, Math.ceil(courseHcp / n))
}

function esNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * FUENTE ÚNICA del Adjusted Gross Score: cada hoyo jugado se topa en su máximo
 * para el índice (`maximoPorHoyo`: doble bogey neto con el course handicap, o
 * par + 5 sin índice). El diferencial SIEMPRE sale de `grossAjustado`.
 *
 * Los golpes del tope son los del COURSE handicap (Regla 6.1), nunca los del
 * playing handicap, repartidos por SI sobre los hoyos de la tarjeta (Apéndice E;
 * un plus devuelve golpe en los SI más altos → par + 1 ahí). Puro, no muta.
 * Re-topar una tarjeta ya topada (p. ej. con hoyos estimados) es idempotente.
 */
export function grossAjustadoWHS(input: GrossAjustadoInput): GrossAjustadoResult {
  const { scores, hoyos, parPorHoyo, siPorHoyo, courseHcp } = input
  const totalHoyos = hoyos.length
  let grossBruto = 0
  let grossAjustado = 0
  const hoyosTopados: GrossAjustadoResult['hoyosTopados'] = []
  const hoyosSinPar: number[] = []

  for (const hoyo of [...new Set(hoyos)].sort((a, b) => a - b)) {
    const gross = golpesEn(scores, hoyo)
    if (gross == null || gross < 1) continue
    grossBruto += gross
    const par = parPorHoyo[hoyo]
    if (!esNumero(par) || par < 1) {
      hoyosSinPar.push(hoyo)
      grossAjustado += gross
      continue
    }
    const si = siPorHoyo?.[hoyo]
    const tope = esNumero(si) && si >= 1
      ? maximoPorHoyo(par, courseHcp == null ? null : strokesRecibidosEnHoyo(courseHcp, si, totalHoyos))
      : topeHolgado(par, courseHcp, totalHoyos)
    if (gross > tope) hoyosTopados.push({ hoyo, gross, tope })
    grossAjustado += Math.min(gross, tope)
  }
  return { grossBruto, grossAjustado, hoyosTopados, hoyosSinPar, completo: hoyosSinPar.length === 0 }
}

/**
 * Qué índice topa una tarjeta (WHS 3.1). FUENTE ÚNICA para el guardado y para
 * cualquier recálculo. Orden: el declarado en la ronda (el que el jugador usó ese
 * día), `profiles.indice` y, si no hay, el Índice Golfers+ (decisión de producto
 * #545: cuenta como índice establecido). `null` = sin índice → par + 5.
 */
export function indiceParaTope(fuentes: {
  deLaRonda?: number | null
  perfil?: number | null
  golfersPlus?: number | null
}): number | null {
  for (const v of [fuentes.deLaRonda, fuentes.perfil, fuentes.golfersPlus]) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/**
 * Detalle del ajuste que se guarda en `historical_rounds.metadata.ajuste_whs`.
 * `indice` y `course_hcp` son los del día de la ronda: un recálculo posterior
 * (corregir un hoyo) los reutiliza en vez de leer el perfil de hoy. `tee` y
 * `hoyos_reparto` dicen para qué tee y cuántos hoyos vale ese `course_hcp`.
 */
export interface AjusteWHSMetadata {
  course_hcp: number | null
  indice: number | null
  si_fuente: FuenteSI
  hoyos_topados: GrossAjustadoResult['hoyosTopados']
  hoyos_sin_par: number[]
  tee?: string | null
  hoyos_reparto?: number
}

/** FUENTE ÚNICA de la forma de `metadata.ajuste_whs` (la escriben todos los writers del diferencial). */
export function metadataAjusteWHS(
  r: GrossAjustadoResult,
  ctx: { courseHcp: number | null; indice: number | null; siFuente: FuenteSI; tee: string | null; hoyosReparto: number },
): AjusteWHSMetadata {
  return {
    course_hcp: ctx.courseHcp,
    indice: ctx.indice,
    si_fuente: ctx.siFuente,
    hoyos_topados: r.hoyosTopados,
    hoyos_sin_par: r.hoyosSinPar,
    tee: ctx.tee,
    hoyos_reparto: ctx.hoyosReparto,
  }
}

/* ── Mínimo de hoyos JUGADOS para un diferencial (WHS 2024, Regla 2.2) ───── */

/** Un score de 9 hoyos exige los 9 jugados; uno de 18, al menos 10 jugados. */
export const MIN_HOYOS_JUGADOS_SCORE_9 = 9
export const MIN_HOYOS_JUGADOS_SCORE_18 = 10

/**
 * Hoyos de la tarjeta estimados porque NO se jugaron (match decidido antes). Los
 * concedidos y los ganados sin terminar sí cuentan como jugados: el hoyo se empezó
 * (Regla 3.3). Acepta `metadata.estimados` tal como viene de la base.
 */
export function hoyosNoJugadosEstimados(estimados: ReadonlyArray<{ motivo: string }> | null | undefined): number {
  return (estimados ?? []).filter(e => e.motivo === 'no_jugado').length
}

/**
 * ¿La tarjeta tiene los hoyos jugados que WHS exige para un diferencial? FUENTE
 * ÚNICA: la usan el cálculo (`diferencialDeTarjeta`) y lo que se muestra
 * (`cuentaParaIndice`). Sin esto, un match de 9 hoyos decidido 5&4 (5 jugados +
 * 4 a par neto) entraba al índice con casi la mitad de la tarjeta inventada.
 */
export function alcanzaMinimoDeHoyosJugados(hoyosEnTarjeta: number, hoyosNoJugados = 0): boolean {
  const jugados = hoyosEnTarjeta - hoyosNoJugados
  return hoyosEnTarjeta <= 9 ? jugados >= MIN_HOYOS_JUGADOS_SCORE_9 : jugados >= MIN_HOYOS_JUGADOS_SCORE_18
}
