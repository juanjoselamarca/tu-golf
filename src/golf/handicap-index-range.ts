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
 * Un índice con UN decimal fijo ("18.0", no "18"), los plus con "+" (−1 → "+1.0").
 * Para avisos que comparan dos índices a la décima.
 */
export function formatearIndice(v: number): string {
  const decima = Math.abs(v).toFixed(1)
  // Un plus que redondea a cero (−0.04) es "0.0", no "+0.0".
  return v < 0 && decima !== '0.0' ? `+${decima}` : decima
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

/** Aviso de un campo de hándicap OBLIGATORIO con texto que no es un número (onboarding sin "No tengo"). */
export const MENSAJE_HANDICAP_NO_ES_NUMERO = 'Escribe un número: 12.4, o +2 si es plus.'
/** Lo mismo para un campo OPCIONAL (registro, perfil, invitados, ronda libre): vacío también vale. */
export const MENSAJE_HANDICAP_OPCIONAL_NO_ES_NUMERO = 'Escribe un número: 12.4, o +2 si es plus, o déjalo vacío.'

export function mensajeHandicapNoEsNumero(opcional: boolean): string {
  return opcional ? MENSAJE_HANDICAP_OPCIONAL_NO_ES_NUMERO : MENSAJE_HANDICAP_NO_ES_NUMERO
}

/**
 * Aviso bajo "Revisar" en ronda libre cuando el índice de un jugador va a medio escribir o no es número.
 * `nombre` null = el creador ("tu índice").
 */
export function mensajeIndiceQueBloquea(nombre: string | null): string {
  const de = nombre == null ? 'tu índice' : `el índice de ${nombre}`
  return `Revisa ${de}: escribe un número (12.4, o +2 si es plus) o déjalo vacío.`
}

/**
 * Estado de un campo de hándicap mientras se tipea. "incompleto" = va a medio escribir ("+", "-", ".",
 * "+,"): el formulario no deja enviar, pero tampoco avisa (avisar al primer "+" es regañar antes de tiempo).
 * "invalido" = hay texto que no es un número: se avisa con MENSAJE_HANDICAP_NO_ES_NUMERO. El RANGO lo
 * decide cada caller (índice WHS, hándicap de cancha), con `esIndiceDeHandicapValido` o
 * `esHandicapDeInscripcionValido`.
 */
export type CampoHandicap =
  | { estado: 'vacio'; valor: null }
  | { estado: 'incompleto'; valor: null }
  | { estado: 'invalido'; valor: null }
  | { estado: 'ok'; valor: number }

export function leerCampoHandicap(texto: string): CampoHandicap {
  const t = texto.trim()
  if (t === '') return { estado: 'vacio', valor: null }
  if (/^[+-]?[.,]?$/.test(t)) return { estado: 'incompleto', valor: null }
  const valor = parsearHandicap(t)
  return Number.isNaN(valor) ? { estado: 'invalido', valor: null } : { estado: 'ok', valor }
}

/**
 * true si el campo se puede enviar tal cual: vacío (sin hándicap) o un número. A medio escribir ("+") o con
 * texto que no es número, no. El RANGO lo decide cada caller (ver `campoIndiceGuardable` para el índice WHS).
 */
export function campoHandicapEnviable(texto: string): boolean {
  const { estado } = leerCampoHandicap(texto)
  return estado === 'vacio' || estado === 'ok'
}

/** Placeholder de todo campo donde se tipea un índice o hándicap: muestra la coma/punto y cómo se escribe un plus. */
export const PLACEHOLDER_CAMPO_HANDICAP = 'Ej: 18.5 o +2'
/**
 * Variante para los campos angostos (ronda libre: 90px en monospace 16px; onboarding: centrado y corto): caben
 * ~6 caracteres y el texto largo se cortaba ("Ej: 10." ya se cortaba). El plus lo explica una pista fija o el
 * aviso si se escribe mal.
 */
export const PLACEHOLDER_CAMPO_HANDICAP_ANGOSTO = 'ej. 18'

/** Texto inicial de un campo de hándicap a partir del valor guardado: un plus (−2) se ve "+2". */
export function textoCampoHandicap(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : formatearHandicap(v)
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

/**
 * Regla de un campo de hándicap tipeado. `opcional`: vacío vale (y el aviso lo dice). `rango: 'indice'`: el
 * número tiene que estar en el rango WHS de índice (perfil, registro, onboarding); `null`: el rango lo valida
 * otro (invitados: depende de lo que guarda el torneo).
 */
export interface ReglaCampoHandicap {
  opcional: boolean
  rango: 'indice' | null
}

/**
 * Aviso EN VIVO del campo, o null. Texto que no es número → mensajeHandicapNoEsNumero; con rango 'indice', un
 * número fuera de rango → MENSAJE_INDICE_FUERA_DE_RANGO. Vacío o a medio escribir ("+") no avisa mientras se
 * tipea: eso se avisa al enviar (useAvisoIndiceAlEnviar).
 */
export function avisoCampoHandicap(texto: string, regla: ReglaCampoHandicap): string | null {
  const campo = leerCampoHandicap(texto)
  if (campo.estado === 'invalido') return mensajeHandicapNoEsNumero(regla.opcional)
  if (regla.rango === 'indice' && campo.estado === 'ok' && !esIndiceDeHandicapValido(campo.valor)) {
    return MENSAJE_INDICE_FUERA_DE_RANGO
  }
  return null
}

/** true si el campo de índice se puede guardar tal cual: vacío (sin índice) o un número dentro del rango WHS. */
export function campoIndiceGuardable(texto: string): boolean {
  if (!campoHandicapEnviable(texto)) return false
  const { valor } = leerCampoHandicap(texto)
  return valor == null || esIndiceDeHandicapValido(valor)
}

/** true si el campo se puede enviar con su regla (vacío cuenta; si el campo es obligatorio, lo ve el caller). */
export function campoHandicapSePuedeEnviar(texto: string, regla: ReglaCampoHandicap): boolean {
  return regla.rango === 'indice' ? campoIndiceGuardable(texto) : campoHandicapEnviable(texto)
}
