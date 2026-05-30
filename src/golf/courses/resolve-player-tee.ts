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
