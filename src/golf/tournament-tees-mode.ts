// src/golf/tournament-tees-mode.ts
//
// `tournaments.tees` NO siempre guarda un nombre de tee.
//
// - Los torneos que crea el wizard guardan ahí el MODO de asignación
//   ('per_player' | 'manual' | 'mixed', ver `deriveTees` en
//   `src/lib/data/tournaments/createTournament.ts`). El tee de cada jugador
//   vive en `players.tee_id`, no en esta columna.
// - Los torneos viejos guardan un color ('blanco', 'azul', 'negras').
//
// Al 30-oct-2026 en prod: 18 torneos con un modo (los recientes, mayo-oct) y
// 27 con un color (los viejos, marzo-sep). O sea: el modo es el caso normal
// de todo lo que se crea hoy.
//
// Quien lea esa columna tiene que distinguir los dos casos ANTES de tratarla
// como un tee. Si no, ofrece "Per_player" como si fuera un color de tee y, al
// elegir un color, pisa el modo del torneo sin avisar.

/** Todo lo que puede aparecer en `tournaments.tees` SIN ser un nombre de tee. */
export const TEES_MODE_KEYS = ['per_player', 'per_category', 'manual', 'mixed'] as const

export type TeesModeKey = (typeof TEES_MODE_KEYS)[number]

/**
 * Los modos que escribe el wizard hoy. `per_category` queda fuera porque
 * `deriveTees` lo manda a 'mixed'; se sigue reconociendo al leer por los
 * torneos históricos.
 */
export type TeesMode = Exclude<TeesModeKey, 'per_category'>

const MODOS = new Set<string>(TEES_MODE_KEYS)

/** El único modo en que el organizador elige el tee de cada jugador a mano. */
export const MODO_TEES_MANUAL: TeesModeKey = 'manual'

/** ¿El valor de `tournaments.tees` es un modo de asignación y no un tee? */
export function esModoDeTees(tees: string | null | undefined): boolean {
  return typeof tees === 'string' && MODOS.has(tees.trim().toLowerCase())
}

/** Etiqueta en español del modo, para mostrársela al organizador. */
export const ETIQUETA_MODO_DE_TEES: Record<TeesModeKey, string> = {
  per_player: 'por jugador',
  per_category: 'por categoría',
  manual: 'asignación manual',
  mixed: 'mixtos',
}

/**
 * De dónde sale el tee de cada jugador en cada modo, en prosa. Es lo que el
 * organizador necesita saber cuando el torneo no tiene un tee global: sin esto
 * la pantalla decía "cada jugador tiene el suyo" y lo mandaba a asignarlos,
 * aunque en tres de los cuatro modos no haya nada que asignar.
 */
export const ORIGEN_DEL_TEE_POR_MODO: Record<TeesModeKey, string> = {
  per_player: 'cada jugador juega desde el tee de su perfil',
  per_category: 'el tee sale de la categoría de cada jugador',
  manual: 'el tee de cada jugador se asigna en el panel de jugadores',
  mixed: 'el tee sale de la categoría de cada jugador',
}

/**
 * ¿El organizador asigna los tees A MANO en este torneo?
 *
 * SOLO 'manual'. Es el único modo que abre el asignador por jugador
 * (`TeesAssignmentSection`, que el panel de jugadores renderiza con esta misma
 * condición). En 'per_player' el tee viene del perfil de cada jugador y en
 * 'mixed'/'per_category' de su categoría: ahí el panel no muestra ningún
 * control de tees, así que ofrecer "asignarlos en el panel" era mandar al
 * organizador a una pantalla donde no existe lo que le prometimos.
 */
export function esModoDeTeesAsignadoAMano(tees: string | null | undefined): boolean {
  return typeof tees === 'string' && tees.trim().toLowerCase() === MODO_TEES_MANUAL
}

/** La prosa del modo, o null si lo guardado es un nombre de tee y no un modo. */
export function origenDelTeeDelTorneo(tees: string | null | undefined): string | null {
  if (!esModoDeTees(tees)) return null
  return ORIGEN_DEL_TEE_POR_MODO[(tees as string).trim().toLowerCase() as TeesModeKey]
}

/**
 * Etiqueta del valor crudo de `tournaments.tees`: el modo traducido, o el
 * valor con mayúscula inicial si es un nombre de tee.
 */
export function etiquetaDeTeesDelTorneo(tees: string): string {
  const k = tees.trim().toLowerCase()
  return ETIQUETA_MODO_DE_TEES[k as TeesModeKey] ?? tees.charAt(0).toUpperCase() + tees.slice(1)
}
