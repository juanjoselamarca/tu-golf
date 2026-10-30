/**
 * Guarda un snapshot de los datos de la cancha en el torneo o ronda.
 *
 * OJO: hoy NADIE lee `course_snapshot` (0 lecturas en src/ al 30-oct-2026). Lo
 * que congela los ratings de una ronda son `rounds.course_rating`/`slope_rating`
 * y `metadata.ratings_9h` (ver `ratingsGuardadosDeLaFila` en
 * `src/lib/data/ajuste-whs-fila.ts`). Antes este comentario decía que el scoring
 * usaba SOLO el snapshot, que es falso y mandaba a cualquiera al archivo
 * equivocado.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCourseSnapshot } from '@/golf/core/stroke-index'
import { columnaDeYardaje } from '@/golf/courses/tee-yardage-column'

export async function saveCourseSnapshot(
  supabase: SupabaseClient,
  table: 'tournaments' | 'rondas_libres',
  recordId: string,
  courseId: string,
  customSI?: Record<string, number> | null,
  teeName?: string | null
): Promise<void> {
  const tee = teeName?.toLowerCase() ?? 'blanco'
  // null = la tabla no tiene columna para este tee (dorado, gris…). El
  // snapshot guarda el yardaje en null antes que el de otro tee.
  const yardCol = columnaDeYardaje(tee)

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
    .select('numero, par, stroke_index, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo, yardaje_verificado_at')
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
      // Snapshot solo persiste yardajes auditados contra fuente primaria.
      yardaje: yardCol && (h as Record<string, unknown>).yardaje_verificado_at
        ? ((h as Record<string, unknown>)[yardCol] as number | null) ?? null
        : null,
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
