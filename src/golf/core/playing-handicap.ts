// src/golf/core/playing-handicap.ts
//
// FUENTE ÚNICA del handicap de juego (Playing Handicap) de un torneo: el
// porcentaje del course handicap con que juega cada jugador, elegido por el
// organizador (`tournaments.hcp_pct`, 100/95/90/85/80/75).
//
// Es el ÚNICO lugar del código que multiplica por ese porcentaje. El gate de
// scoring (`resolveScoringCourseHcp`) lo llama; scorer, servidor, board y GWI
// reciben el número ya aplicado.

import { isTeamFormat, resolveFormatoJuego } from '@/golf/formats'
import { modoDeJuego, type ModoJuego } from './rules'
import { resolverCourseHandicapSinRedondear, type CourseData } from './course-handicap'
import { redondearHandicapWHS } from './stroke-index'

/** Porcentajes que el organizador puede elegir, de mayor a menor. */
export const HCP_PCT_OPCIONES = [100, 95, 90, 85, 80, 75] as const

export type HcpPct = (typeof HCP_PCT_OPCIONES)[number]

/** Sin elección (y todos los torneos anteriores a la columna): handicap completo. */
export const HCP_PCT_DEFAULT: HcpPct = 100

/** ¿Es uno de los porcentajes ofrecidos? Rechaza strings, null y valores intermedios. */
export function esHcpPctValido(valor: unknown): valor is HcpPct {
  return typeof valor === 'number' && (HCP_PCT_OPCIONES as readonly number[]).includes(valor)
}

/** El formato tal como llega: la clave ya resuelta o la fila con sus dos columnas. */
export type FormatoParaHcpPct =
  | string
  | null
  | undefined
  | { formato_juego?: string | null; format?: string | null }

/**
 * FUENTE ÚNICA de "¿con qué porcentaje juega este torneo?".
 *
 * - Formatos de equipo → 100: ya aplican su propia asignación
 *   (`team_config.handicap_pct`); aplicar las dos sería un doble descuento.
 * - Gross → 100: no reparte golpes, y el tab "Neto" del board de un torneo
 *   gross se arma con el handicap completo.
 * - Valor ausente (columna aún sin migrar, torneo viejo) o fuera de las
 *   opciones → 100: el torneo se juega exactamente como antes.
 */
export function hcpPctEfectivo(args: {
  formato: FormatoParaHcpPct
  modo: ModoJuego | string | null | undefined
  hcpPct: number | null | undefined
}): HcpPct {
  const { formato, modo, hcpPct } = args
  const key = formato == null || typeof formato === 'string' ? formato : resolveFormatoJuego(formato)
  if (isTeamFormat(key)) return HCP_PCT_DEFAULT
  if (modoDeJuego(modo) !== 'neto') return HCP_PCT_DEFAULT
  return esHcpPctValido(hcpPct) ? hcpPct : HCP_PCT_DEFAULT
}

/**
 * `hcpPctEfectivo` leído directo de la fila de `tournaments`. Es lo que pasan
 * al gate todos los consumidores (scorers, servidor, board, GWI): una sola
 * forma de leer las cuatro columnas. `hcp_pct` es opcional en el tipo porque
 * una fila sin la columna (o sin seleccionarla) tiene que jugar al 100 %.
 */
export function hcpPctDelTorneo(t: {
  hcp_pct?: number | null
  modo_juego?: string | null
  formato_juego?: string | null
  format?: string | null
}): HcpPct {
  return hcpPctEfectivo({ formato: t, modo: t.modo_juego, hcpPct: t.hcp_pct })
}

/**
 * Playing Handicap = Course Handicap × asignación, con UN solo redondeo final.
 *
 * WHS Rules of Handicapping (USGA/R&A, ed. 2024), Regla 6.2a, p. 69:
 *   "Playing Handicap = Course Handicap (unrounded) x handicap allowance.
 *    The calculated Playing Handicap is rounded to the nearest whole number,
 *    with .5 rounded upwards."
 * Aclaración 6.2a/1 (p. 69-70): la asignación se aplica al course handicap SIN
 * redondear para evitar el doble redondeo (su ejemplo: CR 71, slope 125, par 71,
 * índices 8,6 y 10,3 → CH 9,5132 y 11,3938 → al 85 % dan 8 y 10; con el CH
 * redondeado los dos darían 9). Nota de 6.2a: al 100 % el Playing Handicap es
 * el course handicap redondeado.
 *
 * `courseHandicap` llega SIN redondear cuando se tiene (modo WHS); en modo raw
 * el dato inscrito ya es un entero y el resultado es el mismo.
 *
 * ".5 hacia arriba" es hacia +∞ también con plus (negativos): -1,5 → -1, igual
 * que el ejemplo del diferencial de la Regla 5.1 (-1,55 → -1,5). El redondeo es
 * `redondearHandicapWHS`, el mismo del course handicap: un ,5 exacto que la coma
 * flotante deja en ,4999… (12,4 × 113/113 + 3,1) sube igual.
 * Se multiplica antes de dividir: con enteros el producto es exacto y un ,5 real
 * no se pierde por coma flotante (10 × 85 / 100 = 8,5 exacto → 9).
 */
export function handicapDeJuego(courseHandicap: number, hcpPct: number): number {
  // Al 100 % sin multiplicar: garantiza el course handicap de siempre
  // (`resolverCourseHandicap`) en las rondas y torneos que no eligieron un %.
  if (hcpPct === HCP_PCT_DEFAULT) return redondearHandicapWHS(courseHandicap)
  return redondearHandicapWHS((courseHandicap * hcpPct) / 100)
}

/**
 * `hcp_pct` de una ronda libre: el % que la tarjeta heredó del torneo al
 * iniciarlo (`materializeGroupScorecard`, ya pasado por `hcpPctEfectivo`). Una
 * ronda libre normal, una fila sin la columna o un valor fuera de las opciones
 * juegan al 100 %.
 */
export function hcpPctDeRonda(ronda: { hcp_pct?: number | null }): HcpPct {
  return esHcpPctValido(ronda.hcp_pct) ? ronda.hcp_pct : HCP_PCT_DEFAULT
}

/**
 * FUENTE ÚNICA del handicap que PUNTÚA en una ronda libre (y en la tarjeta de
 * un grupo de torneo): course handicap WHS sin redondear (tee del jugador,
 * 9 hoyos = índice / 2, guardarrail y camino seguro de `resolverCourseHandicap`)
 * × el % de la ronda, con un solo redondeo. Al 100 % es `resolverCourseHandicap`.
 *
 * Solo para la competencia (neto, puntos, golpes del match). Los ajustes WHS de
 * la tarjeta que va al índice (doble bogey neto, hoyos no jugados) usan el
 * course handicap COMPLETO: Regla 3.1b, "the player's full, unrestricted Course
 * Handicap should be used for all applications of net double bogey adjustments".
 */
export function resolverHandicapDeJuego(
  handicapIndex: number,
  courseData: CourseData | null,
  roundHoles: number | undefined,
  hcpPct: number,
): number {
  return handicapDeJuego(resolverCourseHandicapSinRedondear(handicapIndex, courseData, roundHoles), hcpPct)
}

/** Texto visible del porcentaje ("Handicap al 85 %"); null al 100 % (no hay nada que avisar). */
export function etiquetaHcpPct(hcpPct: number | null | undefined): string | null {
  if (hcpPct == null || hcpPct === HCP_PCT_DEFAULT) return null
  return `Handicap al ${hcpPct} %`
}

/**
 * Aviso en futuro para la vista previa del borrador: el simulador no aplica el
 * % (trabaja con índices, sin cancha), así que se avisa la regla que regirá.
 * null al 100 % o sin valor.
 */
export function avisoHcpPctPorJugar(hcpPct: number | null | undefined): string | null {
  const etiqueta = etiquetaHcpPct(hcpPct)
  return etiqueta == null ? null : `Se jugará con handicap al ${hcpPct} %`
}
