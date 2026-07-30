// src/golf/leaderboard/individual-score.ts
//
// FUENTE ÚNICA del score individual de torneo (regla "un concepto, una fuente").
//
// Antes de este módulo el board individual estaba implementado TRES veces con
// matemática divergente:
//   · landing `/torneo/[slug]`  → `Σ rounds.total_net` (columna almacenada)
//   · TV `/torneo/[slug]/tv`    → `Σ rounds.total_net` (columna almacenada)
//   · `/torneo/[slug]/en-vivo`  → nunca computaba el neto (columna en blanco)
// y las tres comparaban el score contra el par de la CANCHA COMPLETA aunque el
// jugador fuera por el hoyo 9. Consecuencia en torneo real: un jugador en par
// thru 9 se pintaba "−36", y como el atrasado resta más par que el adelantado,
// el leaderboard quedaba AL REVÉS durante toda la ronda — lideraba el que menos
// hoyos llevaba. El motor de equipos nunca tuvo el bug; este módulo lleva al
// individual a la misma matemática.
//
// Las dos reglas que fija, y que ningún board puede volver a re-derivar:
//   1. El score se compara contra el par de los hoyos JUGADOS (`parPlayed`).
//   2. El neto se DERIVA de gross + course handicap + stroke index normalizado.
//      Nunca se lee de una columna almacenada: `rounds.total_net` sólo lo
//      escribe `/api/game` al scorear, así que cualquier otro camino de entrada
//      (import, seed, edición manual) la deja en 0 y fabrica un falso líder.

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import type { CourseHole } from './types'

/** Score de un jugador individual, listo para rankear y para mostrar. */
export interface IndividualScore {
  /** `false` = no empezó. La UI muestra "—", nunca "E" ni un número. */
  hasData: boolean
  holesPlayed: number
  /** Suma del par de los hoyos efectivamente jugados. Denominador de vs par. */
  parPlayed: number
  grossTotal: number
  netTotal: number
  stablefordTotal: number
  /** `grossTotal − parPlayed`. 0 cuando no hay datos. */
  vsParGross: number
  /** `netTotal − parPlayed`. 0 cuando no hay datos. */
  vsParNet: number
  /** Gross por hoyo, índice 0 = hoyo 1, `null` si no se jugó. */
  scores: readonly (number | null)[]
  /** Puntos stableford por hoyo (0 en los no jugados). */
  stablefordScores: readonly number[]
}

/** Resultado canónico de "inscrito pero no empezó". Congelado: es compartido. */
export const EMPTY_SCORE: IndividualScore = Object.freeze({
  hasData: false,
  holesPlayed: 0,
  parPlayed: 0,
  grossTotal: 0,
  netTotal: 0,
  stablefordTotal: 0,
  vsParGross: 0,
  vsParNet: 0,
  scores: Object.freeze([] as (number | null)[]),
  stablefordScores: Object.freeze([] as number[]),
})

/** Gross por hoyo: mapa 1-based (`{"1": 4}`) o array 0-based (`[4, …]`). */
export type HoleScoreInput =
  | Record<string | number, number | null | undefined>
  | ReadonlyArray<number | null | undefined>

function grossAtHole(input: HoleScoreInput, hole: number): number | null {
  const raw = Array.isArray(input) ? input[hole - 1] : (input as Record<string, unknown>)[String(hole)]
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Computa el score individual de UNA ronda.
 *
 * @param scores          gross por hoyo (mapa 1-based o array 0-based)
 * @param courseHoles     hoyos de la cancha (par + stroke_index). Filas
 *                        duplicadas por hoyo (canchas 27/36h multi-recorrido)
 *                        se deduplican por `numero`.
 * @param courseHandicap  course handicap de SCORING de la ronda (9h en rondas
 *                        de 9h). NO el índice crudo.
 * @param totalHoles      hoyos de la ronda (9 o 18). Los scores de hoyos por
 *                        encima de este tope se ignoran.
 */
export function computeIndividualScore(
  scores: HoleScoreInput,
  courseHoles: CourseHole[],
  courseHandicap: number,
  totalHoles: number,
): IndividualScore {
  // Dedup por nº de hoyo: en canchas multi-recorrido `course_holes` trae varias
  // filas por hoyo y sumarlas inflaría el par (mismo criterio que el scorer).
  const holeMap = new Map<number, CourseHole>()
  for (const h of courseHoles) {
    if (h.numero >= 1 && h.numero <= totalHoles) holeMap.set(h.numero, h)
  }

  // Catálogo incompleto (cancha con menos hoyos cargados que la ronda): se
  // rellena con par 4 / SI = nº de hoyo, el MISMO fallback que
  // `buildFallbackCourseHoles`. Se hace ANTES de normalizar el SI: un hoyo
  // sintético agregado después conservaría su stroke_index crudo, colisionaría
  // con la permutación y repartiría un golpe de más — justo lo que
  // `normalizedStrokeIndexByHole` existe para impedir ("net +12 Don Jorge").
  for (let h = 1; h <= totalHoles; h++) {
    if (!holeMap.has(h)) holeMap.set(h, { numero: h, par: 4, stroke_index: h })
  }

  const holesDeLaRonda = Array.from(holeMap.values()).sort((a, b) => a.numero - b.numero)

  // SI normalizado a permutación 1..N SÓLO para alocar golpes: un SI de catálogo
  // 18h-impar en un loop de 9h repartiría de menos y el neto saldría alto.
  // No-op si el SI ya es permutación válida. No cambia el SI que se MUESTRA.
  const siAlloc = normalizedStrokeIndexByHole(holesDeLaRonda, totalHoles)
  const hcp = Number.isFinite(courseHandicap) ? courseHandicap : 0

  const scoreArr = new Array<number | null>(totalHoles).fill(null)
  const stablefordScores = new Array<number>(totalHoles).fill(0)
  let grossTotal = 0
  let netTotal = 0
  let stablefordTotal = 0
  let holesPlayed = 0
  let parPlayed = 0

  for (let h = 1; h <= totalHoles; h++) {
    const gross = grossAtHole(scores, h)
    if (gross == null) continue

    // `holeMap` ya cubre 1..totalHoles (rellenado arriba), así que nunca falta.
    const hole = holeMap.get(h) as CourseHole

    scoreArr[h - 1] = gross
    grossTotal += gross
    holesPlayed++

    const si = siAlloc[hole.numero] ?? hole.stroke_index
    parPlayed += hole.par
    netTotal += gross - strokesRecibidosEnHoyo(hcp, si, totalHoles)
    const pts = puntosStablefordHoyo(gross, hole.par, hcp, si, totalHoles)
    stablefordScores[h - 1] = pts
    stablefordTotal += pts
  }

  const hasData = holesPlayed > 0

  return {
    hasData,
    holesPlayed,
    parPlayed,
    grossTotal,
    netTotal,
    stablefordTotal,
    vsParGross: hasData ? grossTotal - parPlayed : 0,
    vsParNet: hasData ? netTotal - parPlayed : 0,
    scores: scoreArr,
    stablefordScores,
  }
}

/**
 * Acumula varias rondas de un mismo jugador (torneos multi-ronda).
 *
 * `parPlayed` se SUMA ronda a ronda — no es `parCancha × rondas`. Un jugador
 * que terminó la ronda 1 y va por el hoyo 9 de la ronda 2 se compara contra
 * 72 + 36, no contra 144.
 *
 * `scores` / `stablefordScores` conservan los de la ÚLTIMA ronda con datos:
 * son la tarjeta que muestra el board, no un acumulado.
 */
export function sumIndividualScores(parts: IndividualScore[]): IndividualScore {
  const withData = parts.filter((p) => p.hasData)
  if (withData.length === 0) return EMPTY_SCORE

  let holesPlayed = 0
  let parPlayed = 0
  let grossTotal = 0
  let netTotal = 0
  let stablefordTotal = 0
  for (const p of withData) {
    holesPlayed += p.holesPlayed
    parPlayed += p.parPlayed
    grossTotal += p.grossTotal
    netTotal += p.netTotal
    stablefordTotal += p.stablefordTotal
  }

  const last = withData[withData.length - 1]

  return {
    hasData: true,
    holesPlayed,
    parPlayed,
    grossTotal,
    netTotal,
    stablefordTotal,
    vsParGross: grossTotal - parPlayed,
    vsParNet: netTotal - parPlayed,
    scores: last.scores,
    stablefordScores: last.stablefordScores,
  }
}

/** Menos tipográfico (U+2212): mismo ancho que "+", alinea bajo tabular-nums. */
const MINUS = '−'

/** Em dash de "sin datos". No es un score — no se colorea ni se ordena como tal. */
export const EMPTY_LABEL = '—'

/**
 * "—" sin datos · "E" en par · "+3" / "−2" con datos.
 *
 * El `hasData` es obligatorio a propósito: la razón de este módulo es que
 * "no empezó" se pintaba como 0 → "E", o peor, como "−36".
 */
export function formatScoreVsPar(vsPar: number, hasData: boolean): string {
  if (!hasData) return EMPTY_LABEL
  if (vsPar === 0) return 'E'
  return vsPar > 0 ? `+${vsPar}` : `${MINUS}${Math.abs(vsPar)}`
}
