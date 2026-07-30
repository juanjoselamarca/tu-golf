// src/golf/courses/resolve-player-tee.ts
//
// Resuelve qué tee usar para un jugador dado, siguiendo el fallback chain:
//   1. players.tee_id              (asignación manual del admin)
//   2. category.default_tee_color  (default por categoría)
//   3. tournament.tees             (tee global del torneo)
//
// Bug #6 inbox 25-may: feature "tee por admin".

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
 * obligatorio: es contra lo que matchea `players.tee_id`.
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
  courseTees: CourseTeeRow[]
}

export interface ResolvePlayerTeeResult {
  tee: CourseTeeRow | null
  source: TeeSource
}

export function resolvePlayerTee(input: ResolvePlayerTeeInput): ResolvePlayerTeeResult {
  if (input.playerTeeId) {
    const t = input.courseTees.find(ct => ct.id === input.playerTeeId)
    if (t) return { tee: t, source: 'manual' }
  }
  if (input.categoryDefaultTeeColor) {
    const target = input.categoryDefaultTeeColor.toLowerCase()
    const t = input.courseTees.find(ct => ct.nombre.toLowerCase() === target)
    if (t) return { tee: t, source: 'category' }
  }
  if (input.tournamentTeesGlobal) {
    const target = input.tournamentTeesGlobal.toLowerCase()
    const t = input.courseTees.find(ct => ct.nombre.toLowerCase() === target)
    if (t) return { tee: t, source: 'global' }
  }
  return { tee: null, source: 'none' }
}
