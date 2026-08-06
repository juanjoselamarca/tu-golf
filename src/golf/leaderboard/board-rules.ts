// src/golf/leaderboard/board-rules.ts
//
// Fuente ÚNICA de los tres conceptos que el board individual de torneo
// contestaba de N formas distintas (regla "un concepto, una fuente"):
//
//   1. ¿Cómo se llama este jugador?      → resolveLegacyPlayerName
//   2. ¿Contra qué par se mide "a par"?  → parOfPlayedHoles
//   3. ¿Hay datos para mostrar?          → hasPlayData
//
// Antes del 29-jul-2026 cada una de las tres pantallas del board individual
// (`/torneo/[slug]`, `/torneo/[slug]/tv`, `/torneo/[slug]/en-vivo`) traía su
// propia respuesta, y las respuestas no coincidían. El caso grave era (2):
// medir un jugador a mitad de vuelta contra el par de la vuelta ENTERA lo
// pinta líder bajo par por el solo hecho de haber jugado poco.

import type { CourseHole } from './types'

// El par de relleno se mudó a `@/golf/courses/vueltas`, que es donde vive la
// construcción de los hoyos de la vuelta (y quien lo aplica cuando falta un
// hoyo). Se re-exporta para no romper los imports existentes: la DEFINICIÓN
// está en un solo lado.
import { PAR_FALLBACK } from '@/golf/courses/vueltas'
export { PAR_FALLBACK }

/** Forma mínima de la fila `players` que necesita la resolución de nombre. */
export interface NameableLegacyPlayer {
  profiles?: { name?: string | null } | null
  player_name?: string | null
}

/**
 * El nombre que se muestra en CUALQUIER board individual.
 *
 * Orden: perfil → nombre de inscripción → genérico. El segundo escalón es el
 * que importa: los INVITADOS (inscritos sin cuenta) no tienen `profiles`, y sin
 * este fallback aparecían como "Sin nombre" en /en-vivo y "Jugador" en el board
 * de la landing — el mismo jugador con dos identidades según la pantalla.
 */
export function resolveLegacyPlayerName(p: NameableLegacyPlayer): string {
  const fromProfile = p.profiles?.name?.trim()
  if (fromProfile) return fromProfile
  const fromRegistration = p.player_name?.trim()
  if (fromRegistration) return fromRegistration
  return 'Jugador'
}

/**
 * Par acumulado de los hoyos REALMENTE jugados.
 *
 * `playedHoleNumbers` es la lista de hoyos con score, con repetición: en un
 * torneo multi-ronda el hoyo 1 aparece una vez por ronda jugada y su par suma
 * una vez por ronda. Un hoyo ausente del catálogo cae a par 4 (mismo fallback
 * que el resto del motor).
 *
 * Es la referencia contra la que se mide "a par". Usar el par de la vuelta
 * completa mientras la vuelta está a medias produce el bug que pintaba a un
 * jugador con 3 hoyos jugados como líder a −60.
 */
export function parOfPlayedHoles(courseHoles: CourseHole[], playedHoleNumbers: number[]): number {
  // Dedup por nº de hoyo: una cancha multi-recorrido (27/36h) trae filas
  // repetidas y sumarlas todas inflaría el par (mismo criterio que
  // `sumParDedupByHole` en la capa de datos).
  const parByHole = new Map<number, number>()
  for (const h of courseHoles) parByHole.set(h.numero, h.par)

  let total = 0
  for (const numero of playedHoleNumbers) {
    total += parByHole.get(numero) ?? PAR_FALLBACK
  }
  return total
}

/**
 * ¿Este jugador tiene algo que mostrar?
 *
 * Un jugador inscrito que todavía no scoreó NO está a par: no tiene score. La
 * UI debe renderizar "—", nunca "E" ni un número derivado de totales en cero.
 */
export function hasPlayData(entry: { holesPlayed: number }): boolean {
  return entry.holesPlayed > 0
}

/**
 * ¿Esta tarjeta se puede comparar con las demás? FUENTE ÚNICA del predicado.
 *
 * Es el portero de todo lo que rankea jugadores entre sí para un resultado
 * definitivo: el podio del torneo cerrado y las stats agregadas. Una tarjeta a
 * medias comparada contra una entera produce el error de siempre — el que jugó
 * menos parece mejor.
 *
 * Pide DOS cosas, porque ninguna alcanza sola:
 *
 *  1. `status === 'F'` — el jugador terminó. Necesario: sin esto, alguien que
 *     va por el hoyo 18 entraría al podio.
 *  2. Tarjeta COMPLETA — se cargaron todos los hoyos de la vuelta. Necesario
 *     porque `status` significa cosas distintas según el origen: en ronda libre
 *     lo pone la propia completitud, pero en el path legacy sale de
 *     `rounds.status ∈ {closed, official}`, que es una acción del organizador y
 *     no dice nada sobre cuántos hoyos se cargaron. En prod hay 3 rondas
 *     `closed` con 9 de 18 hoyos: sólo con `status` entraban con media tarjeta.
 *
 * `scores` viene relleno a los hoyos de la vuelta (nulls incluidos), así que su
 * largo ES el largo de la vuelta. Ojo: eso es cierto por CONVENCIÓN, no por
 * construcción — los builders crean el array con `new Array(totalHoyos)` pero
 * después escriben en `scores[hole_number - 1]`, y JS estira el array si algún
 * día llega un `hole_number` fuera de rango (una vuelta de 9 hoyos numerada
 * 10-18, como la que `a064b6d1` arregló para ronda libre). Si eso pasara acá, el
 * predicado falla CERRADO: el jugador queda fuera del podio en silencio.
 *
 * En multi-ronda `holes` acumula (36) y `scores.length` es una vuelta (18) — de
 * ahí el `>=`. Eso admite correctamente al que jugó las dos, pero TAMBIÉN al que
 * jugó sólo la primera, que además tiende a ganar porque se mide contra el par
 * jugado. Es preexistente y hoy no se alcanza (todos los torneos de prod son de
 * una vuelta); el arreglo pide `roundsPlayed` en `Player`, que existe en
 * `LeaderboardEntry` y `rankEntries` no propaga.
 */
export function isFinishedCard(p: {
  status: string
  holes: number
  scores: ReadonlyArray<unknown>
}): boolean {
  if (p.status !== 'F' || p.holes <= 0) return false
  const holesOfRound = p.scores.length
  return holesOfRound === 0 ? false : p.holes >= holesOfRound
}
