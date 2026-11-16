/**
 * Retiro de un jugador en una Timba libre (spec, "Hoyo pendiente y retiro"). Fuente única de "¿está retirado en
 * este hoyo?": la usan el motor (sus hoyos cuentan como "no jugó") y el scorer (no se rellenan con par ni al pasar
 * de hoyo ni al cerrar: un golpe inventado lo haría jugar un hoyo que no jugó).
 *
 * El retiro corre en ORDEN DE JUEGO desde el hoyo de salida, no por número de hoyo. Un retiro desde un hoyo que
 * no está en la ronda se ignora (contrato, cláusula 9).
 */

/** `true` si el jugador retirado desde `desde` ya no juega el hoyo `numero`. */
export function estaRetiradoEn(desde: number | null | undefined, numero: number, ordenHoyos: readonly number[]): boolean {
  if (desde == null) return false
  const ordenDesde = ordenHoyos.indexOf(desde)
  const ordenHoyo = ordenHoyos.indexOf(numero)
  return ordenDesde >= 0 && ordenHoyo >= 0 && ordenHoyo >= ordenDesde
}

/** Hoyos que el jugador no juega por su retiro, en orden de juego (`[]` sin retiro). */
export function hoyosNoJugadosPorRetiro(desde: number | null | undefined, ordenHoyos: readonly number[]): number[] {
  return ordenHoyos.filter(h => estaRetiradoEn(desde, h, ordenHoyos))
}

/**
 * Los golpes de una tarjeta sin los anotados desde el retiro (en orden de juego): lo que va al historial. El motor
 * ya no los cuenta; sin este filtro llegarían igual a la tarjeta histórica. No borra nada del servidor. Sin retiro
 * (o con un retiro fuera de la ronda) devuelve el mismo objeto.
 */
export function golpesHastaElRetiro<T extends Readonly<Record<string | number, number | null | undefined>>>(
  scores: T,
  desde: number | null | undefined,
  ordenHoyos: readonly number[],
): T {
  if (hoyosNoJugadosPorRetiro(desde, ordenHoyos).length === 0) return scores
  return Object.fromEntries(
    Object.entries(scores).filter(([hoyo]) => !estaRetiradoEn(desde, Number(hoyo), ordenHoyos)),
  ) as T
}

/**
 * Desde qué hoyo se retira quien se va estando en `hoyoActual`: ese mismo si todavía no tiene score, o el primero
 * sin score después. `null` si ya anotó todos los que quedan (no hay hoyo que perder).
 */
export function hoyoDesdeElQueSeRetira(
  scores: Readonly<Record<number, number | null | undefined>> | undefined,
  hoyoActual: number,
  ordenHoyos: readonly number[],
): number | null {
  const desde = Math.max(0, ordenHoyos.indexOf(hoyoActual))
  return ordenHoyos.slice(desde).find(h => scores?.[h] == null) ?? null
}

/**
 * Hoyos que se ofrecen para elegir desde cuál se retira alguien (por si el grupo se acordó tarde): de la salida
 * hasta el hoyo actual, en orden de juego, más el calculado por `hoyoDesdeElQueSeRetira` si quedó después.
 */
export function hoyosParaElegirElRetiro(
  ordenHoyos: readonly number[],
  hoyoActual: number,
  porDefecto: number | null,
): number[] {
  const hasta = Math.max(ordenHoyos.indexOf(hoyoActual), porDefecto == null ? -1 : ordenHoyos.indexOf(porDefecto))
  return ordenHoyos.slice(0, hasta + 1)
}
