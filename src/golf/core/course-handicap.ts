/**
 * Convierte un Handicap Index (decimal, universal) a Course Handicap (entero, por cancha).
 *
 * Fórmula WHS:
 *   18h: CH = round(index × (slope / 113) + (CR - par))
 *    9h: CH = round((index / 2) × (slope_9h / 113) + (CR_9h - par_9h))
 *
 * Si no hay datos de cancha, fallback = round(index).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

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
  // 9 hoyos: el Course Handicap WHS usa el ÍNDICE DE 9 HOYOS = índice 18h / 2,
  // combinado con el slope/CR/par de 9h. `strokesRecibidosEnHoyo` reparte este CH
  // sobre los 9 hoyos jugados (maxSI=9), así que el CH debe ser el de 9h, no el de
  // 18h. Sin esta división, una ronda de 9h recibía ~2× los golpes correctos.
  const idx = courseData.is9Hole ? handicapIndex / 2 : handicapIndex
  return Math.round(idx * (slope / 113) + (courseRating - par))
}

/**
 * Par de los 9 hoyos jugados (front-9), para NO mezclar el CR de 9h con el par de 18h.
 *
 * Causa raíz del bug "neto peor que gross" (11-jun-2026): en una ronda de 9 hoyos
 * sobre una cancha de 18, los callers pasan `parTotal` = suma de los 18 hoyos (72).
 * Combinado con el front-9 Course Rating (~36) daba (CR − par) ≈ −36 → course
 * handicaps NEGATIVOS (−22) → neto peor que gross. Acá se deriva el par REAL del
 * front-9 desde course_holes (autoridad), no la mitad a ojo.
 */
async function resolveNineHolePar(
  supabase: SupabaseClient,
  courseId: string,
  parTotal: number | undefined,
): Promise<number> {
  // Si el caller ya pasó un par de 9 hoyos (≤50, nunca confundible con un par de 18h),
  // es correcto: respetarlo.
  if (parTotal != null && parTotal <= 50) return parTotal
  // El caller pasó el par de 18 (o nada): derivar el par del front-9 real.
  const { data } = await supabase
    .from('course_holes')
    .select('numero, par')
    .eq('course_id', courseId)
    .order('numero')
  if (data && data.length > 0) {
    // Dedup por numero — algunas canchas tienen filas duplicadas por recorrido;
    // un .limit(9) crudo agarraría 1,1,2,2,… y sumaría menos de 9 hoyos. Tomamos
    // el par de los 9 hoyos de MENOR numero (front-9) sin duplicar.
    const parByNumero = new Map<number, number>()
    for (const h of data as Array<{ numero: number; par: number | null }>) {
      if (!parByNumero.has(h.numero)) parByNumero.set(h.numero, h.par ?? 4)
    }
    const front9 = Array.from(parByNumero.entries()).sort((a, b) => a[0] - b[0]).slice(0, 9)
    if (front9.length > 0) return front9.reduce((s, [, par]) => s + par, 0)
  }
  // Sin datos de hoyos: mitad del par-18 si lo tenemos (aprox. simétrica), si no 36.
  return parTotal != null ? Math.round(parTotal / 2) : 36
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
 *
 * Usa el cliente browser de Supabase (solo client-side). Para contextos
 * server-side (leaderboard) usar `resolverCourseData` con el cliente del request.
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
  return resolverCourseData(createClient(), courseId, tees, holes, parTotal, recorridos)
}

/**
 * Núcleo de `cargarCourseData` parametrizado por cliente Supabase, para reusar la
 * MISMA lógica de lookup (tee-specific → courses → multi-recorrido) tanto en el
 * scorer client-side como en el leaderboard server-side. Garantiza que el course
 * handicap del leaderboard coincida exactamente con el de la tarjeta en cancha.
 */
export async function resolverCourseData(
  supabase: SupabaseClient,
  courseId: string | null,
  tees: string,
  holes: number,
  parTotal?: number,
  recorridos?: string[] | null
): Promise<CourseData | null> {
  if (!courseId) return null

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
    .maybeSingle()

  if (teeData?.rating && teeData?.slope) {
    if (holes <= 9 && teeData.front_course_rating && teeData.front_slope_rating) {
      return {
        slope: teeData.front_slope_rating,
        courseRating: teeData.front_course_rating,
        par: await resolveNineHolePar(supabase, courseId, parTotal),
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
    .maybeSingle()

  if (course?.slope_rating && course?.course_rating) {
    if (holes <= 9) {
      // Sin CR/slope de 9h en la tabla courses: aprox. WHS (CR/2), mismo criterio
      // que indice-golfers.ts. El par debe ser de 9 hoyos, NO de 18.
      return {
        slope: course.slope_rating,
        courseRating: course.course_rating / 2,
        par: await resolveNineHolePar(supabase, courseId, parTotal),
        is9Hole: true,
      }
    }
    return {
      slope: course.slope_rating,
      courseRating: course.course_rating,
      par: parTotal ?? course.par_total ?? 72,
    }
  }

  return null
}
