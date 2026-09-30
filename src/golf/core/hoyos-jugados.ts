/**
 * src/golf/core/hoyos-jugados.ts
 *
 * FUENTE ÚNICA de "¿qué hoyos se juegan en esta ronda, y en qué orden?".
 *
 * Por qué existe
 * --------------
 * El motor y las pantallas de ronda libre asumían que una ronda de N hoyos son
 * los hoyos 1..N (`for (let h = 1; h <= holes; h++)`). Una ronda de 9 que parte
 * en el 10 guarda sus scores con las claves 10..18, así que todo lo que miraba
 * 1..9 veía una tarjeta vacía: leaderboard y En Vivo en 0, el neto repartía los
 * golpes en hoyos que no se jugaron y, al finalizar, el relleno "hoyos sin
 * marcar → par" pisaba los hoyos 1..9 con par y el historial guardaba nueve
 * pares en vez de la ronda real.
 *
 * Quien necesite recorrer los hoyos de una ronda recorre `hoyosDeLaRonda(...)`.
 * Las funciones del motor que aceptan `hoyos?` usan 1..N sólo cuando no se les
 * pasa (compatibilidad con torneos, que siempre juegan desde el 1).
 */

/**
 * Hoyos jugados, en el orden en que se juegan. hoyoInicio=4, holes=18 →
 * [4,5,...,18,1,2,3].
 *
 * El wrap circular es sobre el TAMAÑO DE LA CANCHA (`courseHoles`, default 18), no
 * sobre la cantidad de hoyos jugados. Confundir ambos rompía el Back 9: `(10, 9)`
 * con módulo 9 colapsaba a [1..9] (jugaba el front en vez del back). Con módulo 18:
 * front `(1,9)`→[1..9], back `(10,9)`→[10..18], shotgun 18h `(10,18)`→[10..18,1..9].
 *
 * Por qué el default 18 es seguro hoy: una ronda con `holes=9` sólo se crea en cancha
 * single-loop (el selector multi-loop sólo ofrece combos de 2 loops → siempre 18h), y
 * ahí el shotgun está deshabilitado, así que `hoyoInicio ∈ {1, 10}` sobre una cancha de
 * 18. Si algún día se juega una cancha de ≤9 hoyos con shotgun (start > 9), el caller
 * DEBE pasar el `courseHoles` real, o el wrap generaría hoyos inexistentes.
 */
export function hoyosDeLaRonda(
  hoyoInicio: number | null | undefined,
  totalHoles: number,
  courseHoles = 18,
): number[] {
  const inicio = hoyoInicio != null && Number.isInteger(hoyoInicio) && hoyoInicio >= 1 ? hoyoInicio : 1
  const orden: number[] = []
  for (let i = 0; i < totalHoles; i++) {
    orden.push(((inicio - 1 + i) % courseHoles) + 1)
  }
  return orden
}

/** 1..N — los hoyos de una ronda que parte en el 1. Default de las funciones con `hoyos?`. */
export function hoyosDesdeElUno(totalHoles: number): number[] {
  return Array.from({ length: Math.max(0, Math.trunc(totalHoles) || 0) }, (_, i) => i + 1)
}

/** ¿Qué mitad de la cancha es una ronda de 9? Decide qué rating de 9 hoyos aplica. */
export type MitadDeLaCancha = 'front' | 'back'

/**
 * Mitad de la cancha que se jugó, o `null` si la ronda no es de exactamente 9
 * hoyos de una misma mitad (18 hoyos, o 9 que cruzan del 18 al 1 en shotgun).
 */
export function mitadJugada(hoyos: readonly number[]): MitadDeLaCancha | null {
  if (hoyos.length !== 9) return null
  if (hoyos.every(h => h >= 1 && h <= 9)) return 'front'
  if (hoyos.every(h => h >= 10 && h <= 18)) return 'back'
  return null
}
