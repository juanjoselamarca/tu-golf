/**
 * Stroke Index resolution — jerarquía: custom > verificado > estimado
 *
 * Para Stableford y Match Play, el SI determina qué hoyos reciben golpes.
 * El sistema usa la mejor fuente disponible.
 */

export interface HoleData {
  numero: number
  par: number
  stroke_index: number
  yardaje?: number | null
}

export interface CourseSnapshot {
  holes: HoleData[]
  par_total: number
  course_rating: number | null
  slope_rating: number | null
  front_course_rating?: number | null
  front_slope_rating?: number | null
  back_course_rating?: number | null
  back_slope_rating?: number | null
  si_source: 'custom' | 'verified' | 'estimated' | 'generic'
}

/**
 * Resolve stroke index for each hole, applying the best available source.
 * Priority: custom (organizer input) > verified (official) > estimated (algorithm) > generic (fallback)
 */
export function resolveStrokeIndex(
  courseHoles: HoleData[],
  customSI: Record<string, number> | null,
  siVerificado: boolean
): { holes: HoleData[]; source: CourseSnapshot['si_source'] } {
  if (customSI && Object.keys(customSI).length > 0) {
    const holes = courseHoles.map(h => ({
      ...h,
      stroke_index: customSI[String(h.numero)] ?? h.stroke_index,
    }))
    return { holes, source: 'custom' }
  }

  if (siVerificado) {
    return { holes: courseHoles, source: 'verified' }
  }

  // Check if SI looks generic (all odd in front, all even in back with standard pattern)
  const isGeneric = courseHoles.length === 18 &&
    courseHoles.slice(0, 9).every(h => h.stroke_index % 2 === 1) &&
    courseHoles.slice(9).every(h => h.stroke_index % 2 === 0) &&
    courseHoles[0].stroke_index === 7 &&
    courseHoles[1].stroke_index === 15

  return { holes: courseHoles, source: isGeneric ? 'generic' : 'estimated' }
}

/**
 * Build a course snapshot to save with tournament/ronda at creation time.
 * This snapshot is immutable — scoring always uses it, never live course data.
 */
export function buildCourseSnapshot(
  courseHoles: HoleData[],
  courseData: {
    par_total: number
    course_rating: number | null
    slope_rating: number | null
    front_course_rating?: number | null
    front_slope_rating?: number | null
    back_course_rating?: number | null
    back_slope_rating?: number | null
  },
  customSI: Record<string, number> | null,
  siVerificado: boolean
): CourseSnapshot {
  const { holes, source } = resolveStrokeIndex(courseHoles, customSI, siVerificado)

  return {
    holes,
    par_total: courseData.par_total,
    course_rating: courseData.course_rating,
    slope_rating: courseData.slope_rating,
    front_course_rating: courseData.front_course_rating ?? null,
    front_slope_rating: courseData.front_slope_rating ?? null,
    back_course_rating: courseData.back_course_rating ?? null,
    back_slope_rating: courseData.back_slope_rating ?? null,
    si_source: source,
  }
}

/**
 * Calculate course handicap for 9 holes using 9-hole CR/slope.
 * WHS formula: CH = index × (slope_9h / 113) + (CR_9h - par_9h)
 */
export function courseHandicap9h(
  handicapIndex: number,
  slope9h: number,
  cr9h: number,
  par9h: number
): number {
  return Math.round(handicapIndex * (slope9h / 113) + (cr9h - par9h))
}

/**
 * Calculate course handicap for 18 holes.
 * WHS formula: CH = index × (slope / 113) + (CR - par)
 */
export function courseHandicap18h(
  handicapIndex: number,
  slope: number,
  courseRating: number,
  par: number
): number {
  return Math.round(handicapIndex * (slope / 113) + (courseRating - par))
}

/**
 * Validate a custom stroke index input.
 * Returns null if valid, error message if invalid.
 */
export function validateCustomSI(si: Record<string, number>, holeCount: number): string | null {
  const values = Object.values(si)
  if (values.length !== holeCount) {
    return `Debes ingresar la dificultad para los ${holeCount} hoyos`
  }

  const expected = Array.from({ length: holeCount }, (_, i) => i + 1)
  const sorted = [...values].sort((a, b) => a - b)

  for (let i = 0; i < expected.length; i++) {
    if (sorted[i] !== expected[i]) {
      return `Cada número del 1 al ${holeCount} debe aparecer exactamente una vez`
    }
  }

  return null
}

/**
 * Determine if SI warning should be shown based on format and course data.
 */
export function shouldShowSIWarning(
  format: string,
  modoJuego: string,
  holeCount: number,
  siSource: CourseSnapshot['si_source']
): boolean {
  // Gross never needs SI
  if (modoJuego === 'gross' && format === 'stroke_play') return false

  // Stableford and match play always need accurate SI
  if (format === 'stableford' || modoJuego === 'stableford') return siSource !== 'custom' && siSource !== 'verified'

  // Neto only matters for 9 holes (total net is same regardless of SI for 18)
  if (modoJuego === 'neto' && holeCount === 9) return siSource !== 'custom' && siSource !== 'verified'

  return false
}
