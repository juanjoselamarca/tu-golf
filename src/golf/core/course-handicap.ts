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
 * @param recorridos - lista de loop_nombre a combinar (canchas 27h/36h). Si length>=1
 *                    y la cancha tiene children matching, combina sus ratings.
 */
export async function cargarCourseData(
  courseId: string | null,
  tees: string,
  holes: number,
  parTotal?: number,
  recorridos?: string[] | null
): Promise<CourseData | null> {
  if (!courseId) return null

  // Dynamic import para evitar que el módulo se evalúe en contextos no-browser
  const { createClient } = await import('@/lib/supabase')
  const supabase = createClient()

  // 0. Multi-recorrido: si hay loops seleccionados, combinar ratings de los
  //    child courses correspondientes (ej: Brisas 27h = parent + 3 children).
  //    Cada child (9h) aporta su CR (aditivo) y slope (promediado).
  if (recorridos && recorridos.length >= 1) {
    const { data: children } = await supabase
      .from('courses')
      .select('id, loop_nombre, course_rating, slope_rating, par_total')
      .eq('parent_id', courseId)
      .in('loop_nombre', recorridos)

    if (children && children.length === recorridos.length) {
      // Sumar CR/par across loops; promediar slope ponderado por hoyos.
      // Asumimos que cada child es 9h (o 18h si tipo_recorrido lo define).
      const crSum = children.reduce((s, c) => s + (c.course_rating ?? 0), 0)
      const parSum = children.reduce((s, c) => s + (c.par_total ?? 36), 0)
      const slopeAvg = children.length > 0
        ? Math.round(children.reduce((s, c) => s + (c.slope_rating ?? 113), 0) / children.length)
        : 113
      const allHaveRatings = children.every(c => c.course_rating && c.slope_rating)
      if (allHaveRatings) {
        return {
          slope: slopeAvg,
          courseRating: crSum,
          par: parTotal ?? parSum,
          is9Hole: recorridos.length === 1,
        }
      }
      // Fallback a tee-specific lookup sobre children individualmente.
      const teeNorm2 = tees.toLowerCase()
      const childIds = children.map(c => c.id)
      const { data: teeRows } = await supabase
        .from('course_tees')
        .select('course_id, rating, slope, front_course_rating, front_slope_rating')
        .in('course_id', childIds)
        .ilike('nombre', `${teeNorm2}%`)
      if (teeRows && teeRows.length === children.length) {
        const crSumTee = teeRows.reduce((s, t) => s + (t.front_course_rating ?? t.rating ?? 0), 0)
        const slopeAvgTee = Math.round(
          teeRows.reduce((s, t) => s + (t.front_slope_rating ?? t.slope ?? 113), 0) / teeRows.length
        )
        if (crSumTee > 0 && slopeAvgTee > 0) {
          return {
            slope: slopeAvgTee,
            courseRating: crSumTee,
            par: parTotal ?? parSum,
            is9Hole: recorridos.length === 1,
          }
        }
      }
      // Si data insuficiente en children → caer al flujo single-course.
    }
  }

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
