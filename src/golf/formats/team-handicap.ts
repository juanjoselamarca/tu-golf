// src/golf/formats/team-handicap.ts
//
// Fuente única del handicap de equipo en bola compartida (Rules of
// Handicapping, Apéndice C; decisión de producto 23-oct-2026):
//   - Scramble: un % por posición, del jugador con menor handicap de cancha al
//     de mayor. 2 jugadores 35/15 · 3 jugadores 30/20/10 · 4 jugadores 25/20/15/10.
//   - Foursome: 50 % de la suma de los dos handicaps de cancha.
// Se aplica sobre el handicap de cancha de cada jugador, SIN redondear, con un
// solo redondeo final (WHS 6.2a: redondear antes cambia el resultado). Aquí vive
// también el cálculo (`handicapDeEquipo`): lo usan el inicio de torneo, la
// ronda libre por equipos, el wizard y el validador.

import { redondearHandicapWHS } from '../core/stroke-index'
import { courseHandicapParaHoyos } from '../core/course-handicap'

export type TamanoEquipo = 2 | 3 | 4

/**
 * Handicap del equipo (scramble y foursome). Best ball NO lo usa: cada jugador
 * juega con su propio handicap de juego (`hcp_pct`).
 *
 * - `oficial`: la asignación oficial según formato y tamaño (abajo).
 * - `personalizado` scramble: un % por posición, del jugador con menor
 *   handicap al de mayor (`porcentajes.length` = jugadores del equipo).
 * - `personalizado` foursome: un % de la suma de los dos handicaps.
 *
 * Ausente = oficial. La forma vieja del JSONB se convierte al leer
 * (`@/lib/draft/team-config-legacy`).
 */
export type TeamHandicapConfig =
  | { modo: 'oficial' }
  | { modo: 'personalizado'; porcentajes: number[] }
  | { modo: 'personalizado'; porcentaje_suma: number }

export const SCRAMBLE_ASIGNACION_OFICIAL: Readonly<Record<TamanoEquipo, readonly number[]>> = {
  2: [35, 15],
  3: [30, 20, 10],
  4: [25, 20, 15, 10],
}

export const FOURSOME_PCT_SUMA_OFICIAL = 50

/**
 * Un porcentaje de handicap de equipo válido: entero entre 0 y 100. Fuente
 * única para el schema, el validador, la lectura de la forma vieja y el wizard.
 */
export function esPorcentajeDeEquipo(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100
}

/**
 * Aviso (no bloquea) para un scramble personalizado cuyos % suman más de 100:
 * el equipo recibiría más golpes que el handicap completo de un jugador. Lo
 * muestran el wizard (bajo los %) y el validador (`team_handicap_pcts_sum`).
 * null si no corresponde o si algún % no es válido (eso ya es un error).
 */
export function avisoSumaScramble(porcentajes: readonly unknown[]): string | null {
  if (!porcentajes.every(esPorcentajeDeEquipo)) return null
  const suma = porcentajes.reduce((a, b) => a + b, 0)
  return suma > 100
    ? `Los porcentajes suman ${suma} %: el equipo recibe más golpes que el handicap completo de un jugador. ¿Es lo que quieres?`
    : null
}

/** Porcentajes oficiales de scramble para `n` jugadores; null si no hay asignación. */
export function asignacionOficialScramble(n: number): readonly number[] | null {
  return n === 2 || n === 3 || n === 4 ? SCRAMBLE_ASIGNACION_OFICIAL[n] : null
}

/**
 * Porcentajes de scramble para un equipo de `n` jugadores, del menor handicap
 * al mayor. Oficial (o sin config) → la asignación oficial; personalizado → los
 * % del organizador, solo si hay uno por jugador. null si no hay asignación
 * posible (tamaño sin tabla, % de otro largo o con la forma de foursome).
 */
export function porcentajesScramble(n: number, handicap?: TeamHandicapConfig | null): readonly number[] | null {
  if (!handicap || handicap.modo === 'oficial') return asignacionOficialScramble(n)
  if (!('porcentajes' in handicap)) return null
  const pcts = handicap.porcentajes
  return pcts.length === n && pcts.every(esPorcentajeDeEquipo) ? pcts : null
}

/** Redondeo WHS sin −0 (−0,5 → 0, no −0: se escribe en un smallint y se muestra). */
function redondearEquipo(valor: number): number {
  return redondearHandicapWHS(valor) + 0
}

function sonHandicapsValidos(ch: readonly number[]): boolean {
  return ch.length > 0 && ch.every((v) => typeof v === 'number' && Number.isFinite(v))
}

/**
 * Handicap de equipo de scramble. `chSinRedondear`: el handicap de cancha de
 * cada jugador SIN redondear, en cualquier orden (se ordena de menor a mayor;
 * un plus es el menor). Σ pct_i × ch_i / 100 (multiplicar antes de dividir) y un
 * solo redondeo WHS. null si no hay porcentajes para ese tamaño.
 *
 * Ej. oficial 2 jugadores, 9,51 y 11,39 → 35 % × 9,51 + 15 % × 11,39 = 5,04 → 5.
 */
export function handicapEquipoScramble(
  chSinRedondear: readonly number[],
  handicap?: TeamHandicapConfig | null,
): number | null {
  if (!sonHandicapsValidos(chSinRedondear)) return null
  const pcts = porcentajesScramble(chSinRedondear.length, handicap)
  if (!pcts) return null
  const ordenados = [...chSinRedondear].sort((a, b) => a - b)
  const suma = ordenados.reduce((acc, ch, i) => acc + pcts[i] * ch, 0)
  return redondearEquipo(suma / 100)
}

/**
 * Handicap de equipo de foursome: % de la suma de los dos handicaps de cancha
 * SIN redondear (oficial 50 %), un solo redondeo WHS. null si no son 2 jugadores
 * o si el personalizado no trae `porcentaje_suma`.
 *
 * Ej. oficial 9,51 + 11,39 = 20,91 → 50 % = 10,45 → 10.
 */
export function handicapEquipoFoursome(
  chSinRedondear: readonly number[],
  handicap?: TeamHandicapConfig | null,
): number | null {
  if (chSinRedondear.length !== 2 || !sonHandicapsValidos(chSinRedondear)) return null
  let pct: number = FOURSOME_PCT_SUMA_OFICIAL
  if (handicap && handicap.modo === 'personalizado') {
    if (!('porcentaje_suma' in handicap) || !esPorcentajeDeEquipo(handicap.porcentaje_suma)) return null
    pct = handicap.porcentaje_suma
  }
  return redondearEquipo((pct * (chSinRedondear[0] + chSinRedondear[1])) / 100)
}

/**
 * Handicap de equipo según formato: scramble y foursome lo calculan; best ball
 * y cualquier otro → null (cada jugador juega con su propio handicap).
 */
export function handicapDeEquipo(
  formato: string | null | undefined,
  chSinRedondear: readonly number[],
  handicap?: TeamHandicapConfig | null,
): number | null {
  if (formato === 'scramble') return handicapEquipoScramble(chSinRedondear, handicap)
  if (formato === 'foursome') return handicapEquipoFoursome(chSinRedondear, handicap)
  return null
}

/**
 * Handicap de equipo que REPARTE golpes en una ronda de `roundHoles` hoyos (el
 * motor de scramble y foursome). `juego` (`ronda_equipos.handicap_equipo_juego`)
 * ya viene en la escala de los hoyos de la ronda y manda. Sin él (filas creadas
 * antes de que existiera la columna) se parte el completo de 18 hoyos como
 * siempre (`courseHandicapParaHoyos`): los resultados ya jugados no cambian.
 */
export function handicapDeEquipoParaHoyos(
  completo: number | null | undefined,
  juego: number | null | undefined,
  roundHoles: number,
): number {
  if (juego != null) return juego
  return courseHandicapParaHoyos(completo ?? 0, roundHoles)
}
