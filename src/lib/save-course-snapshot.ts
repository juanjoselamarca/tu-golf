/**
 * Guarda un snapshot inmutable de los datos de la cancha en el torneo o ronda.
 * Se llama después de crear el torneo/ronda. El scoring usa SOLO el snapshot.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCourseSnapshot } from '@/golf/core/stroke-index'

/** Map tee name → column for hole yardage */
function getTeeYardageColumn(tee: string): string {
  const map: Record<string, string> = {
    campeonato: 'yardaje_campeonato',
    negro: 'yardaje_campeonato',
    azul: 'yardaje_azul',
    blanco: 'yardaje_blanco',
    amarillo: 'yardaje_blanco',
    rojo: 'yardaje_rojo',
  }
  return map[tee.toLowerCase()] ?? 'yardaje_blanco'
}

export async function saveCourseSnapshot(
  supabase: SupabaseClient,
  table: 'tournaments' | 'rondas_libres',
  recordId: string,
  courseId: string,
  customSI?: Record<string, number> | null,
  teeName?: string | null
): Promise<void> {
  const tee = teeName?.toLowerCase() ?? 'blanco'
  const yardCol = getTeeYardageColumn(tee)

  // Fetch course base data
  const { data: course } = await supabase
    .from('courses')
    .select('par_total, slope_rating, course_rating, si_verificado')
    .eq('id', courseId)
    .single()

  if (!course) return

  // Fetch holes with all yardage columns (pick the right one in JS)
  const { data: holes } = await supabase
    .from('course_holes')
    .select('numero, par, stroke_index, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo')
    .eq('course_id', courseId)
    .order('numero')

  if (!holes || holes.length === 0) return

  // Fetch tee-specific CR/Slope from course_tees
  // Try exact tee match first, then partial match, then any tee with ratings
  const { data: allTees } = await supabase
    .from('course_tees')
    .select('nombre, rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
    .eq('course_id', courseId)

  let matchedTee = allTees?.find(t => t.nombre.toLowerCase() === tee)
  if (!matchedTee) {
    matchedTee = allTees?.find(t => t.nombre.toLowerCase().startsWith(tee))
  }
  if (!matchedTee && allTees && allTees.length > 0) {
    matchedTee = allTees[0]
  }

  // Use tee-specific CR/Slope if available, fall back to course-level
  const courseRating = matchedTee?.rating ?? course.course_rating
  const slopeRating = matchedTee?.slope ?? course.slope_rating

  const snapshot = buildCourseSnapshot(
    holes.map(h => ({
      numero: h.numero,
      par: h.par,
      stroke_index: h.stroke_index,
      yardaje: (h as Record<string, unknown>)[yardCol] as number | null ?? h.yardaje_blanco,
    })),
    {
      par_total: course.par_total,
      course_rating: courseRating,
      slope_rating: slopeRating,
      front_course_rating: matchedTee?.front_course_rating ?? null,
      front_slope_rating: matchedTee?.front_slope_rating ?? null,
      back_course_rating: matchedTee?.back_course_rating ?? null,
      back_slope_rating: matchedTee?.back_slope_rating ?? null,
    },
    customSI ?? null,
    course.si_verificado ?? false
  )

  await supabase
    .from(table)
    .update({ course_snapshot: snapshot })
    .eq('id', recordId)
}
