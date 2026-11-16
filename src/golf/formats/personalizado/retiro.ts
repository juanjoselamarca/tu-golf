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
