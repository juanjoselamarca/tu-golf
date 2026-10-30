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
 * Etiqueta del valor crudo de `tournaments.tees`: el modo traducido, o el
 * valor con mayúscula inicial si es un nombre de tee.
 */
export function etiquetaDeTeesDelTorneo(tees: string): string {
  const k = tees.trim().toLowerCase()
  return ETIQUETA_MODO_DE_TEES[k as TeesModeKey] ?? tees.charAt(0).toUpperCase() + tees.slice(1)
}
