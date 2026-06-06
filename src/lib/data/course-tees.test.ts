import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTeeRatingsForCourse } from './course-tees'

/** Stub mínimo de supabase: from().select().eq() → { data }. */
function stubSupabase(rows: unknown[] | null): SupabaseClient {
  const builder = {
    select() { return this },
    eq() { return Promise.resolve({ data: rows, error: null }) },
  }
  return { from() { return builder } } as unknown as SupabaseClient
}

const teeRows = [
  { nombre: 'blanco', genero: 'M', rating: 71.6, slope: 129, front_course_rating: 35.8, front_slope_rating: 128, back_course_rating: 35.8, back_slope_rating: 130 },
]

describe('resolveTeeRatingsForCourse', () => {
  it('resuelve CR/slope 18h desde course_tees', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase(teeRows), 'course-1', 'blanco', 18)
    expect(r).toEqual({ cr: 71.6, slope: 129, nineHoleRatings: null })
  })

  it('devuelve null sin course_id (no consulta)', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase(teeRows), null, 'blanco', 18)
    expect(r).toBeNull()
  })

  it('devuelve null si la cancha no tiene tees', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase([]), 'course-1', 'blanco', 18)
    expect(r).toBeNull()
  })

  it('devuelve null si el color no matchea (no inventa)', async () => {
    const r = await resolveTeeRatingsForCourse(stubSupabase(teeRows), 'course-1', 'morado', 18)
    expect(r).toBeNull()
  })
})
