/**
 * Equipos de club (scramble rápido, plan docs/superpowers/plans/2026-11-23-scramble-rapido.md):
 * equipos que entran a una ronda libre solo con su nombre y el hándicap que les da el club, sin jugadores.
 *
 * FUENTE ÚNICA de las reglas del modo: cuántos equipos, en cuántos hoyos, qué hándicap vale, cómo se graba y
 * quién anota. La usan el validador (UI y servidor) y POST /api/ronda-libre/create.
 */

import type { HandicapsDeEquipo } from '@/golf/formats/team-handicap'

/** Tope de equipos del modo. */
export const MAX_EQUIPOS_DE_CLUB = 4

/** Hoyos en que se juega el modo. 27 no: el formulario solo ofrece 9 y 18. */
export const HOYOS_DE_EQUIPOS_DE_CLUB = [9, 18] as const

/** Quién anota: un celular para todos los equipos o uno por equipo (el segundo necesita cuenta). */
export const OPCIONES_QUIEN_ANOTA = ['uno', 'cada_equipo'] as const
export type QuienAnota = (typeof OPCIONES_QUIEN_ANOTA)[number]

/**
 * `ronda_equipos.handicap_origen`: 'club' marca al equipo de club sin inferirlo de "equipo con menos de 2
 * miembros". Los equipos de siempre quedan en 'calculado', el default de la columna.
 */
export type HandicapOrigen = 'calculado' | 'club'

export function esHoyosDeEquiposDeClub(holes: number): boolean {
  return (HOYOS_DE_EQUIPOS_DE_CLUB as readonly number[]).includes(holes)
}

/**
 * Hándicap de club más alto que se acepta: 2 golpes por hoyo (36 en 18 hoyos, 18 en 9). Es lo que
 * `calcularScramble` reparte completo sobre el stroke index de los hoyos jugados; más arriba ya no se modela.
 * En 9 hoyos el número del club se usa tal cual (no se parte), así que su techo es el de 9 hoyos.
 */
export function handicapDeClubMaximo(holes: number): number {
  return 2 * holes
}

/** Entero de 0 al máximo de esos hoyos. Sin plus (el teclado numérico del iPhone no tiene signo menos) ni decimales. */
export function esHandicapDeClubValido(v: unknown, holes: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= handicapDeClubMaximo(holes)
}

/**
 * Cómo se graba el hándicap de un equipo de club: el mismo número en `handicap_equipo` (el que se muestra) y en
 * `handicap_equipo_juego` (el que reparte golpes). Con `juego` presente, `handicapDeEquipoParaHoyos` lo usa tal
 * cual, así el motor, la tabla y la tarjeta muestran y puntúan el número del club sin tocar código. Gross: null.
 */
export function handicapsDeEquipoDeClub(v: number | null): HandicapsDeEquipo {
  return { completo: v, juego: v }
}

/**
 * `admin_mode` de la ronda, lo decide el servidor: un celular anota todo (true) salvo que se pida un celular por
 * equipo. Con un solo equipo no se pregunta y siempre es un celular.
 */
export function adminModeDeEquiposDeClub(quienAnota: QuienAnota | null, cantidadDeEquipos: number): boolean {
  return cantidadDeEquipos <= 1 || quienAnota !== 'cada_equipo'
}
