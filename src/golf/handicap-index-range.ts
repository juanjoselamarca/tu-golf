// src/golf/handicap-index-range.ts
//
// FUENTE ÚNICA de tres cosas sobre el handicap que entra por un write-path
// (inscripción de invitados, ronda libre, admin, editor del organizador):
//   1. el rango aceptable de un ÍNDICE (−10..54),
//   2. el rango aceptable de `players.handicap_at_registration` según lo que
//      guarda la columna en ese torneo (índice en WHS, course handicap en raw),
//   3. cómo se tipea y cómo se muestra un plus ("+2" ↔ −2).
//
// WHS: el índice máximo es 54.0. Abajo no hay tope formal; los plus se guardan
// en negativo (+2.0 → -2.0) y -10 cubre con holgura a cualquier jugador real.
//
// Por qué existe: el índice entra directo al neto del leaderboard. Un invitado
// que tipea "185" queriendo decir 18.5 (al sol, con guante) quedaba inscrito
// con índice 185 y ganaba el neto sin que nadie lo notara. El rango estaba
// copiado a mano en dos endpoints y ausente en los dos de invitados; el editor
// del organizador tenía un cuarto (0..54) que rechazaba a los jugadores plus.

import { resolverCourseHandicap, type CourseData } from './core/course-handicap'
import { esModoHcpWhs } from './core/compute-player-course-hcp'

export const HANDICAP_INDEX_MIN = -10
export const HANDICAP_INDEX_MAX = 54

/** Qué número guarda `handicap_at_registration` y entre qué valores es creíble. */
export interface RangoHandicap {
  min: number
  max: number
  /** `indice` en modo WHS · `course_handicap` en torneos raw/legacy. */
  guarda: 'indice' | 'course_handicap'
}

/** El rango del ÍNDICE: lo que validan los endpoints de inscripción y la ronda libre. */
export const RANGO_INDICE: RangoHandicap = {
  min: HANDICAP_INDEX_MIN,
  max: HANDICAP_INDEX_MAX,
  guarda: 'indice',
}

/**
 * Rango de `handicap_at_registration` según `tournaments.hcp_calc_mode`.
 *
 * - `whs`: la columna guarda el ÍNDICE crudo (el leaderboard lo convierte con el
 *   tee del jugador) → rango de índice.
 * - raw/legacy: la columna guarda el COURSE HANDICAP que `/api/torneos/[slug]/players`
 *   calcula con `resolverCourseHandicap(indice, cancha)`, y el leaderboard lo
 *   reparte tal cual. El rango creíble es la imagen del rango de índice por ESA
 *   misma fórmula, no un tope inventado: con slope 130 y CR−par +1,5 un índice
 *   54 es un course handicap 64, y rechazarlo con "máximo 54" era rechazar a un
 *   jugador legítimo. Sin cancha creíble la fórmula devuelve el índice, así que
 *   el rango vuelve a ser el de índice.
 *
 * En raw el rango es la UNIÓN de esa imagen con el rango de índice: a los
 * invitados `/api/torneos/[slug]/players` les guarda el índice tipeado, sin
 * convertir, y en una cancha fácil (slope 105) la imagen no llega a 54.
 */
export function rangoDeHandicapDeInscripcion(
  hcpCalcMode: string | null | undefined,
  course: CourseData | null,
): RangoHandicap {
  if (esModoHcpWhs(hcpCalcMode)) return RANGO_INDICE
  const a = resolverCourseHandicap(HANDICAP_INDEX_MIN, course)
  const b = resolverCourseHandicap(HANDICAP_INDEX_MAX, course)
  return {
    min: Math.min(HANDICAP_INDEX_MIN, a, b),
    max: Math.max(HANDICAP_INDEX_MAX, a, b),
    guarda: 'course_handicap',
  }
}

/** Columnas de `courses` que usa la inscripción → `CourseData` del motor; null si falta slope o CR. */
export function courseDataDeInscripcion(
  course: { slope_rating: number | null; course_rating: number | null; par_total: number | null } | null | undefined,
): CourseData | null {
  if (!course || course.slope_rating == null || course.course_rating == null) return null
  return { slope: course.slope_rating, courseRating: course.course_rating, par: course.par_total ?? 72 }
}

/**
 * Cómo se MUESTRA un handicap o índice: los plus con signo "+" (−2 → "+2"),
 * nunca en negativo. Un "-2" a la vista invita a "corregirlo" a 2 y mueve el
 * neto 4 golpes. Sin dato → "--". Los decimales se muestran como vienen.
 */
export function formatearHandicap(v: number | string | null | undefined): string {
  if (v == null || v === '') return '--'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '--'
  return n < 0 ? `+${String(-n)}` : String(n)
}

/**
 * Lo que tipea el usuario → número. Acepta el plus con signo ("+2" → −2, la
 * notación del golf), el negativo con que lo guarda la app ("-2" → −2) y la
 * coma decimal ("18,5"). Devuelve NaN si no es un número: el caller decide el
 * mensaje con `mensajeHandicapFueraDeRango`.
 */
export function parsearHandicap(texto: string): number {
  const t = texto.trim().replace(',', '.')
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return NaN
  const conSigno = t[0] === '+' || t[0] === '-'
  const n = Number(conSigno ? t.slice(1) : t)
  return conSigno && n !== 0 ? -n : n
}

/** Mensaje para el usuario cuando el índice está fuera de rango. */
export const MENSAJE_INDICE_FUERA_DE_RANGO =
  `Revisa el índice de handicap: debe estar entre ${formatearHandicap(HANDICAP_INDEX_MIN)} (plus) y ${HANDICAP_INDEX_MAX}.`

/** Mensaje para el usuario según lo que guarda la columna en ese torneo. */
export function mensajeHandicapFueraDeRango(rango: RangoHandicap): string {
  if (rango.guarda === 'indice') return MENSAJE_INDICE_FUERA_DE_RANGO
  return `Revisa el handicap: en este torneo se guarda el handicap de cancha, entre ${formatearHandicap(rango.min)} y ${formatearHandicap(rango.max)}.`
}

/** true si `v` es un número finito dentro de `rango`. */
export function esHandicapDeInscripcionValido(v: unknown, rango: RangoHandicap): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= rango.min && v <= rango.max
}

/** true si `v` es un número finito dentro del rango WHS de ÍNDICE. */
export function esIndiceDeHandicapValido(v: unknown): v is number {
  return esHandicapDeInscripcionValido(v, RANGO_INDICE)
}
