// src/golf/courses/resolve-player-tee.ts
//
// Resuelve qué tee usar para un jugador dado, siguiendo el fallback chain:
//   1. players.tee_id              (asignación manual del admin)
//   2. category.default_tee_color  (default por categoría)
//   3. tournament.tees             (tee global del torneo)
//
// Bug #6 inbox 25-may: feature "tee por admin".
//
// GÉNERO (25-sep-2026): FedeGolf parte cada cancha en una fila VARONES (todos
// sus tees con `genero='M'`, INCLUIDO rojo/M) y una DAMAS (rojo/F, y en 14 de
// 96 tees compartidos del catálogo el rating difiere: Hacienda Chicureo blanco
// V 71.6/137 vs D 78.6/142). El torneo apunta a UNA fila (23 de 24 en prod a la
// VARONES), así que `courseTees` puede traer los tees de la fila hermana
// (`genderVariantIds`) y acá se elige el del género del jugador. WHS exige el
// rating del género de quien juega. Sin género conocido, o sin un tee de ese
// género con ese nombre, NO se adivina: se toma el primero que matchea por
// nombre, que es el de la fila del torneo (los callers ponen esa primero) —
// exactamente lo que hacía este resolver antes.
//
// El género del jugador viene CONGELADO en `players.genero` (se copia del
// perfil al inscribirse): `profiles` no es legible por anon, así que leerlo en
// render haría que el handicap dependa de quién mira el board.

import { normalizeGender, type CourseGender } from './gender-variant'

export interface CourseTeeRow {
  id: string
  nombre: string
  rating: number | null
  slope: number | null
  yardaje_total: number | null
  genero?: string | null
  front_course_rating?: number | null
  front_slope_rating?: number | null
  back_course_rating?: number | null
  back_slope_rating?: number | null
}

/**
 * Columnas de `course_tees` que hay que traer para poder construir un `CourseTeeRow`.
 *
 * Vive acá, pegada al tipo, porque es de lo que depende que el scorer y la tabla
 * pública repartan los MISMOS golpes: si una pantalla deja de pedir
 * `front_course_rating`, su course handicap de 9 hoyos se calcula con otra
 * fórmula que el de la otra y los netos se separan en silencio. `id` es
 * obligatorio: es contra lo que matchea `players.tee_id`. `genero` es lo que
 * desambigua rojo/M de rojo/F.
 *
 * Una sola literal, sin concatenar: supabase-js infiere el tipo de la fila desde
 * el string literal del `select()`, y un `'a' + 'b'` lo ensancha a `string` y le
 * hace perder el tipado de la respuesta.
 */
export const COURSE_TEE_COLUMNS =
  'id, nombre, rating, slope, yardaje_total, genero, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating'

export type TeeSource = 'manual' | 'category' | 'global' | 'none'

export interface ResolvePlayerTeeInput {
  playerTeeId: string | null
  categoryDefaultTeeColor: string | null
  tournamentTeesGlobal: string | null
  /** Tees de la cancha de la ronda PRIMERO, y después los de su variante de género (si viajan). */
  courseTees: CourseTeeRow[]
  /** Género del jugador ('M' | 'F'); null = desconocido, no se desambigua. */
  playerGender?: CourseGender | null
}

export interface ResolvePlayerTeeResult {
  tee: CourseTeeRow | null
  source: TeeSource
}

/**
 * El tee con ese nombre para este jugador. Entre varios del mismo nombre
 * (rojo/M de la fila VARONES + rojo/F de la DAMAS) gana el del género del
 * jugador; sin género o sin ese género disponible, el primero en el orden
 * en que vinieron (la cancha del torneo primero).
 */
function findByName(courseTees: CourseTeeRow[], name: string, gender: CourseGender | null | undefined): CourseTeeRow | null {
  const target = name.toLowerCase()
  const candidates = courseTees.filter((ct) => ct.nombre.toLowerCase() === target)
  if (candidates.length === 0) return null
  if (gender) {
    const delGenero = candidates.find((ct) => normalizeGender(ct.genero) === gender)
    if (delGenero) return delGenero
  }
  return candidates[0]
}

export function resolvePlayerTee(input: ResolvePlayerTeeInput): ResolvePlayerTeeResult {
  if (input.playerTeeId) {
    const manual = input.courseTees.find(ct => ct.id === input.playerTeeId)
    // El admin elige un NOMBRE de tee ("blanco"), no una fila: `tee_id` apunta
    // a la fila de la cancha del torneo, y el rating correcto para una jugadora
    // es el de ese mismo nombre en la fila DAMAS. Se resuelve por nombre y
    // género, igual que los otros dos eslabones — si no, "blanco" manual daba
    // el rating VARONES y "blanco" global daba el DAMAS a la misma jugadora.
    if (manual) return { tee: findByName(input.courseTees, manual.nombre, input.playerGender) ?? manual, source: 'manual' }
  }
  if (input.categoryDefaultTeeColor) {
    const t = findByName(input.courseTees, input.categoryDefaultTeeColor, input.playerGender)
    if (t) return { tee: t, source: 'category' }
  }
  if (input.tournamentTeesGlobal) {
    const t = findByName(input.courseTees, input.tournamentTeesGlobal, input.playerGender)
    if (t) return { tee: t, source: 'global' }
  }
  return { tee: null, source: 'none' }
}

/** Lo que un jugador de torneo trae sobre su género, en el orden de confianza. */
export interface PlayerGenderSources {
  /** `players.genero` ('M' | 'F' | null): congelado al inscribirse. */
  genero?: string | null
  /** `categories.gender` ('M' | 'F' | null). Una categoría "Damas" implica F. */
  categories?: { gender?: string | null } | null
}

/**
 * FUENTE ÚNICA del género de un jugador de torneo para elegir tee: primero el
 * congelado en la inscripción, después la categoría. Null si ninguno lo dice —
 * y entonces el resolver no desambigua. NUNCA `profiles`: no es legible por
 * anon y el handicap del board no puede depender de quién mira.
 */
export function playerGenderOf(player: PlayerGenderSources): CourseGender | null {
  return normalizeGender(player.genero) ?? normalizeGender(player.categories?.gender)
}
