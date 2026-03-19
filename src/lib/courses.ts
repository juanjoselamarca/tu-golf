import type { SupabaseClient } from '@supabase/supabase-js'
import type { CourseSummary, CourseHole, CourseTee, Course } from './course-types'

/**
 * Lista canchas para selectores de UI.
 * Ordenadas por ciudad + nombre.
 */
export async function listCoursesForSelector(
  supabase: SupabaseClient
): Promise<CourseSummary[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('id, nombre, ciudad, par_total')
    .eq('activa', true)
    .order('ciudad', { ascending: true })
    .order('nombre', { ascending: true })

  if (error) throw error
  return (data ?? []) as CourseSummary[]
}

/**
 * Cancha completa con hoyos.
 */
export async function getCourseWithHoles(
  supabase: SupabaseClient,
  courseId: string
): Promise<{ course: Course; holes: CourseHole[] }> {
  const [courseRes, holesRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase.from('course_holes').select('*').eq('course_id', courseId).order('numero'),
  ])

  if (courseRes.error) throw courseRes.error

  return {
    course: courseRes.data as Course,
    holes: (holesRes.data ?? []) as CourseHole[],
  }
}

/**
 * Par por hoyo → Map<numero, par> para lookup O(1).
 */
export async function getHolePars(
  supabase: SupabaseClient,
  courseId: string
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from('course_holes')
    .select('numero, par')
    .eq('course_id', courseId)
    .order('numero')

  if (error) throw error

  const map = new Map<number, number>()
  for (const hole of data ?? []) {
    map.set(hole.numero, hole.par)
  }
  return map
}

/**
 * Stroke index por hoyo → Map<numero, stroke_index>.
 */
export async function getHoleStrokeIndexes(
  supabase: SupabaseClient,
  courseId: string
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from('course_holes')
    .select('numero, stroke_index')
    .eq('course_id', courseId)
    .order('numero')

  if (error) throw error

  const map = new Map<number, number>()
  for (const hole of data ?? []) {
    if (hole.stroke_index != null) {
      map.set(hole.numero, hole.stroke_index)
    }
  }
  return map
}

/**
 * Tees de una cancha (si la tabla course_tees existe).
 */
export async function getCourseTees(
  supabase: SupabaseClient,
  courseId: string
): Promise<CourseTee[]> {
  const { data, error } = await supabase
    .from('course_tees')
    .select('*')
    .eq('course_id', courseId)
    .order('nombre')

  if (error) return [] // Table may not exist yet
  return (data ?? []) as CourseTee[]
}

/**
 * Nombre para mostrar en UI.
 */
export function getCourseDisplayName(
  course: Pick<Course, 'nombre'> & { loop_nombre?: string | null }
): string {
  return course.loop_nombre
    ? `${course.nombre} — ${course.loop_nombre}`
    : course.nombre
}
