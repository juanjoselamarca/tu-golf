/**
 * Guarda un snapshot inmutable de los datos de la cancha en el torneo o ronda.
 * Se llama después de crear el torneo/ronda. El scoring usa SOLO el snapshot.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCourseSnapshot } from '@/golf/core/stroke-index'

export async function saveCourseSnapshot(
  supabase: SupabaseClient,
  table: 'tournaments' | 'rondas_libres',
  recordId: string,
  courseId: string,
  customSI?: Record<string, number> | null
): Promise<void> {
  // Fetch course data
  const { data: course } = await supabase
    .from('courses')
    .select('par_total, slope_rating, course_rating, si_verificado')
    .eq('id', courseId)
    .single()

  if (!course) return

  // Fetch holes
  const { data: holes } = await supabase
    .from('course_holes')
    .select('numero, par, stroke_index, yardaje_blanco')
    .eq('course_id', courseId)
    .order('numero')

  if (!holes || holes.length === 0) return

  // Fetch 9h ratings from course_tees (best available tee)
  const { data: tees } = await supabase
    .from('course_tees')
    .select('front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
    .eq('course_id', courseId)
    .not('front_course_rating', 'is', null)
    .limit(1)
    .single()

  const snapshot = buildCourseSnapshot(
    holes.map(h => ({
      numero: h.numero,
      par: h.par,
      stroke_index: h.stroke_index,
      yardaje_blanco: h.yardaje_blanco,
    })),
    {
      par_total: course.par_total,
      course_rating: course.course_rating,
      slope_rating: course.slope_rating,
      front_course_rating: tees?.front_course_rating ?? null,
      front_slope_rating: tees?.front_slope_rating ?? null,
      back_course_rating: tees?.back_course_rating ?? null,
      back_slope_rating: tees?.back_slope_rating ?? null,
    },
    customSI ?? null,
    course.si_verificado ?? false
  )

  await supabase
    .from(table)
    .update({ course_snapshot: snapshot })
    .eq('id', recordId)
}
