/**
 * Tramos de las parejas que rotan (La Colombiana): la ronda se parte en 3 tramos, uno por cada combinación de
 * parejas de 4 jugadores. Fuente única del largo de cada tramo: la usan el motor (qué parejas juegan cada hoyo) y
 * todo texto que diga "rotan cada N hoyos" (catálogo, frase del juego, parejas en Confirmar).
 */
/** Tramos de parejas rotativas: uno por cada combinación de parejas de 4 jugadores. */
export const TRAMOS_ROTATIVOS = 3

/** Hoyos de cada tramo (si la ronda no se parte pareja, el último tramo se lleva el resto). */
export function hoyosPorTramo(totalHoyos: number): number {
  return Math.max(1, Math.floor(totalHoyos / TRAMOS_ROTATIVOS))
}

/** Hoyos de cada tramo cuando los 3 son iguales (6 en 18, 3 en 9, 9 en 27); `null` si no lo son. */
export function hoyosPorTramoParejo(totalHoyos: number): number | null {
  return totalHoyos % TRAMOS_ROTATIVOS === 0 ? hoyosPorTramo(totalHoyos) : null
}

