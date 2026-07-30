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

/**
 * Par asumido para un hoyo que el catálogo de la cancha no tiene.
 *
 * Fuente única del fallback de par del board: la consume `parOfPlayedHoles` y
 * también `buildFallbackCourseHoles` (cancha entera sin catálogo). Tienen que
 * coincidir: si difirieran, una cancha sin catálogo y una cancha a la que le
 * falta UN hoyo puntuarían con criterios distintos.
 *
 * Decisión (29-jul-2026): NO se reusa `STANDARD_PARS` de `golf/coach/hole-pars`
 * aunque responda una pregunta parecida. Ese array es un layout par-72 concreto
 * y su propio doc avisa que miente en canchas par 70/71 — que son varias de las
 * nuestras (Los Leones, Sport Francés, Prince of Wales) —, además de no cubrir
 * los hoyos >18 de las canchas multi-recorrido. Acá hace falta un valor neutro
 * por hoyo, no un layout. Los dos conceptos se parecen y no son el mismo.
 */
export const PAR_FALLBACK = 4

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
