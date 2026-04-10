/**
 * Convierte un Handicap Index (decimal, universal) a Course Handicap (entero, por cancha).
 *
 * Fórmula WHS:
 *   18h: CH = round(index × (slope / 113) + (CR - par))
 *    9h: CH = round(index × (slope_9h / 113) + (CR_9h - par_9h))
 *
 * Si no hay datos de cancha, fallback = round(index).
 */

export interface CourseData {
  slope: number
  courseRating: number
  par: number
  is9Hole?: boolean
}

/**
 * Calcula Course Handicap a partir de Handicap Index y datos de cancha.
 * Siempre devuelve un entero (no existen "0.5 golpes").
 */
export function resolverCourseHandicap(
  handicapIndex: number,
  courseData: CourseData | null
): number {
  if (!courseData || !courseData.slope || !courseData.courseRating) {
    return Math.round(handicapIndex)
  }
  const { slope, courseRating, par } = courseData
  return Math.round(handicapIndex * (slope / 113) + (courseRating - par))
}

/**
 * Carga CourseData desde Supabase para una cancha/tee/holes dado.
 * Usa el cliente browser de Supabase (solo para componentes client-side).
 *
 * @param courseId - ID de la cancha (null = sin cancha vinculada)
 * @param tees - nombre del tee (ej: "azul", "blanco")
 * @param holes - cantidad de hoyos (9 o 18)
 * @param parTotal - par total real calculado desde course_holes (más preciso que BD)
 */
export async function cargarCourseData(
  courseId: string | null,
  tees: string,
  holes: number,
  parTotal?: number
): Promise<CourseData | null> {
  if (!courseId) return null

  // Dynamic import para evitar que el módulo se evalúe en contextos no-browser
  const { createClient } = await import('@/lib/supabase')
  const supabase = createClient()

  // 1. Intentar CR/Slope específico del tee (más preciso)
  const teeNorm = tees.toLowerCase()
  const { data: teeData } = await supabase
    .from('course_tees')
    .select('rating, slope, front_course_rating, front_slope_rating')
    .eq('course_id', courseId)
    .ilike('nombre', `${teeNorm}%`)
    .limit(1)
    .single()

  if (teeData?.rating && teeData?.slope) {
    if (holes <= 9 && teeData.front_course_rating && teeData.front_slope_rating) {
      return {
        slope: teeData.front_slope_rating,
        courseRating: teeData.front_course_rating,
        par: parTotal ?? 36,
        is9Hole: true,
      }
    }
    return {
      slope: teeData.slope,
      courseRating: teeData.rating,
      par: parTotal ?? 72,
    }
  }

  // 2. Fallback: tabla courses
  const { data: course } = await supabase
    .from('courses')
    .select('slope_rating, course_rating, par_total')
    .eq('id', courseId)
    .single()

  if (course?.slope_rating && course?.course_rating) {
    return {
      slope: course.slope_rating,
      courseRating: course.course_rating,
      par: parTotal ?? course.par_total ?? 72,
    }
  }

  return null
}
