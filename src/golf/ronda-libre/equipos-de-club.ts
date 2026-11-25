/**
 * Equipos de club (scramble rápido, plan docs/superpowers/plans/2026-11-23-scramble-rapido.md):
 * equipos que entran a una ronda libre solo con su nombre y el hándicap que les da el club, sin jugadores.
 *
 * FUENTE ÚNICA de las reglas del modo: cuántos equipos, en cuántos hoyos, qué hándicap vale, cómo se graba y
 * quién anota. La usan el validador (UI y servidor) y POST /api/ronda-libre/create.
 */

import type { HandicapsDeEquipo } from '@/golf/formats/team-handicap'

/** El único formato que admite equipos de club: en scramble el equipo juega una bola y un solo número. */
export function admiteEquiposDeClub(formato: string): boolean {
  return formato === 'scramble'
}

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
 * Hándicap de club más alto que se acepta: 2 golpes por hoyo (36 en 18 hoyos, 18 en 9; decisión de producto).
 * Queda dentro de lo que `calcularScramble` reparte completo sobre el stroke index de los hoyos jugados (hasta 3
 * por hoyo, `strokesRecibidosEnHoyo`). En 9 hoyos el número del club se usa tal cual (no se parte), por eso su
 * techo es el de 9 hoyos y no 36.
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

/** El equipo entró con el hándicap del club (sin jugadores). Una fila sin la columna (lectura vieja) no lo es. */
export function esEquipoDeClub(equipo: { handicap_origen?: HandicapOrigen | null }): boolean {
  return equipo.handicap_origen === 'club'
}

/**
 * La ronda es de equipos de club: scramble y TODOS sus equipos entraron con el hándicap del club. Sin equipos no lo
 * es. Una ronda mixta (no la crea ningún camino) se trata como una de equipos de siempre.
 */
export function esRondaDeEquiposDeClub(
  formato: string | null | undefined,
  equipos: ReadonlyArray<{ handicap_origen?: HandicapOrigen | null }> | null | undefined,
): boolean {
  return !!formato && admiteEquiposDeClub(formato) && !!equipos && equipos.length > 0 && equipos.every(esEquipoDeClub)
}

/**
 * Quiénes juegan la ronda, para contarlos en el encabezado: los jugadores que juegan una tarjeta (no los que van
 * solo por estructura en un equipo de club) y los equipos. Ensayo 24-nov: una ronda de 2 equipos de club decía
 * «1 jugador» (el creador, que va por estructura). `null` en lo que no se cuenta.
 */
export function participantesDeLaRonda(
  jugadorIds: readonly string[],
  equipos: readonly EquipoConMiembros[],
): { jugadores: number | null; equipos: number | null } {
  if (equipos.length === 0) return { jugadores: jugadorIds.length, equipos: null }
  const juegan = jugadorIds.filter(id => !vaSoloPorEstructura(equipos, id)).length
  return { jugadores: juegan > 0 ? juegan : null, equipos: equipos.length }
}

/**
 * Los integrantes que se muestran de un equipo (tarjeta del scorer, tabla, cuadro ganador, imagen para
 * compartir). Un equipo de club no muestra ninguno: el creador va como miembro del primero solo para que la ronda
 * tenga su tarjeta (plan §1), no porque juegue en ese equipo.
 */
export function integrantesQueSeMuestran<T>(equipo: { handicap_origen?: HandicapOrigen | null }, integrantes: readonly T[]): T[] {
  return esEquipoDeClub(equipo) ? [] : [...integrantes]
}

/** Lo mínimo de un equipo para saber quién juega en él. */
interface EquipoConMiembros {
  jugadorIds: readonly string[]
  handicap_origen?: HandicapOrigen | null
}

/**
 * El equipo en que JUEGA el jugador: el que lo tiene como miembro y no es de club. El creador de una ronda de club
 * está en el primer equipo solo por estructura (plan §1): ese equipo no es suyo y su tarjeta no va a su historial.
 */
export function equipoQueJuega<E extends EquipoConMiembros>(equipos: readonly E[], jugadorId: string): E | undefined {
  return equipos.find(e => !esEquipoDeClub(e) && e.jugadorIds.includes(jugadorId))
}

/**
 * El jugador va en la ronda solo por estructura (miembro de un equipo de club): no jugó una tarjeta propia, así que
 * no se guarda en su historial, no mueve su índice y no se le avisa al coach.
 */
export function vaSoloPorEstructura(equipos: readonly EquipoConMiembros[], jugadorId: string): boolean {
  return equipos.some(e => esEquipoDeClub(e) && e.jugadorIds.includes(jugadorId))
}
