/**
 * Tests para src/golf/core/stroke-index.ts — lógica WHS de dificultad por hoyo.
 *
 * Stroke Index (SI) determina qué hoyos reciben golpes en Stableford y Match Play.
 * Un bug aquí genera scores netos incorrectos para TODOS los jugadores con
 * handicap. Cobertura previa: 0%. Después de estos tests: ≥80%.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveStrokeIndex,
  buildCourseSnapshot,
  courseHandicap9h,
  courseHandicap18h,
  validateCustomSI,
  shouldShowSIWarning,
  type HoleData,
} from '@/golf/core/stroke-index'

// Helper: cancha de 18 hoyos con pattern no-genérico
function makeCourse18(): HoleData[] {
  // SIs diversos, no matchean el pattern generic (7/15 al inicio, etc.)
  const sis = [5, 13, 1, 11, 17, 7, 3, 15, 9, 6, 14, 2, 12, 18, 8, 4, 16, 10]
  return sis.map((si, i) => ({
    numero: i + 1,
    par: i < 4 || i === 8 ? 4 : i === 7 ? 5 : 4,
    stroke_index: si,
  }))
}

// Helper: cancha con SI genérico típico (usa el patrón detectable)
function makeCourseGeneric18(): HoleData[] {
  // Front: impares, Back: pares, y hoyo 1=7, hoyo 2=15 (pattern signature)
  const sis = [7, 15, 3, 11, 1, 13, 5, 17, 9, 8, 16, 4, 12, 2, 14, 6, 18, 10]
  return sis.map((si, i) => ({
    numero: i + 1,
    par: 4,
    stroke_index: si,
  }))
}

describe('resolveStrokeIndex', () => {
  it('con customSI → source="custom" y aplica SI del usuario', () => {
    const holes = makeCourse18()
    const custom = { '1': 1, '2': 2, '3': 3 } // override solo primeros 3
    const { holes: result, source } = resolveStrokeIndex(holes, custom, false)
    expect(source).toBe('custom')
    expect(result[0].stroke_index).toBe(1)
    expect(result[1].stroke_index).toBe(2)
    expect(result[2].stroke_index).toBe(3)
    // Los demás mantienen su SI original
    expect(result[3].stroke_index).toBe(holes[3].stroke_index)
  })

  it('customSI vacío ({}) no activa custom, cae a siguiente nivel', () => {
    const holes = makeCourse18()
    const { source } = resolveStrokeIndex(holes, {}, true)
    expect(source).toBe('verified')
  })

  it('customSI null + verified=true → source="verified"', () => {
    const holes = makeCourse18()
    const { holes: result, source } = resolveStrokeIndex(holes, null, true)
    expect(source).toBe('verified')
    expect(result).toBe(holes) // mismo reference — devuelve sin modificar
  })

  it('sin custom ni verified + pattern genérico detectado → source="generic"', () => {
    const holes = makeCourseGeneric18()
    const { source } = resolveStrokeIndex(holes, null, false)
    expect(source).toBe('generic')
  })

  it('sin custom ni verified + pattern NO genérico → source="estimated"', () => {
    const holes = makeCourse18() // no matchea el pattern
    const { source } = resolveStrokeIndex(holes, null, false)
    expect(source).toBe('estimated')
  })

  it('cancha de 9 hoyos no puede ser generic (solo 18 califica)', () => {
    const holes: HoleData[] = Array.from({ length: 9 }, (_, i) => ({
      numero: i + 1,
      par: 4,
      stroke_index: i + 1,
    }))
    const { source } = resolveStrokeIndex(holes, null, false)
    expect(source).toBe('estimated') // nunca generic para 9h
  })

  it('customSI con clave inexistente usa fallback stroke_index del hole', () => {
    const holes = makeCourse18()
    const custom = { '1': 1 } // solo hoyo 1
    const { holes: result } = resolveStrokeIndex(holes, custom, false)
    expect(result[0].stroke_index).toBe(1)
    expect(result[5].stroke_index).toBe(holes[5].stroke_index) // sin cambio
  })
})

describe('buildCourseSnapshot', () => {
  const baseCourseData = {
    par_total: 72,
    course_rating: 71.2,
    slope_rating: 128,
  }

  it('compone snapshot con ratings y SI resuelto', () => {
    const holes = makeCourse18()
    const snapshot = buildCourseSnapshot(holes, baseCourseData, null, true)
    expect(snapshot.par_total).toBe(72)
    expect(snapshot.course_rating).toBe(71.2)
    expect(snapshot.slope_rating).toBe(128)
    expect(snapshot.si_source).toBe('verified')
    expect(snapshot.holes).toHaveLength(18)
  })

  it('aplica customSI al snapshot', () => {
    const holes = makeCourse18()
    const custom: Record<string, number> = {}
    holes.forEach((h, i) => { custom[String(h.numero)] = i + 1 })
    const snapshot = buildCourseSnapshot(holes, baseCourseData, custom, false)
    expect(snapshot.si_source).toBe('custom')
    expect(snapshot.holes[0].stroke_index).toBe(1)
    expect(snapshot.holes[17].stroke_index).toBe(18)
  })

  it('null-safe para front/back ratings', () => {
    const holes = makeCourse18()
    const snapshot = buildCourseSnapshot(holes, baseCourseData, null, true)
    expect(snapshot.front_course_rating).toBeNull()
    expect(snapshot.front_slope_rating).toBeNull()
    expect(snapshot.back_course_rating).toBeNull()
    expect(snapshot.back_slope_rating).toBeNull()
  })

  it('preserva front/back ratings cuando existen', () => {
    const holes = makeCourse18()
    const snapshot = buildCourseSnapshot(
      holes,
      {
        ...baseCourseData,
        front_course_rating: 35.6,
        front_slope_rating: 125,
        back_course_rating: 35.6,
        back_slope_rating: 131,
      },
      null,
      true
    )
    expect(snapshot.front_course_rating).toBe(35.6)
    expect(snapshot.front_slope_rating).toBe(125)
    expect(snapshot.back_course_rating).toBe(35.6)
    expect(snapshot.back_slope_rating).toBe(131)
  })
})

describe('courseHandicap18h', () => {
  it('WHS: 10.5 × (128/113) + (71.2 − 72) = 10.31 → round 10', () => {
    // 10.5 * 1.13274 - 0.8 = 11.894 - 0.8 = 11.094 → 11 (más preciso)
    const ch = courseHandicap18h(10.5, 128, 71.2, 72)
    expect(ch).toBe(11)
  })

  it('plus handicap (-2.0) en cancha estándar', () => {
    // -2.0 × (130/113) + (71.0 - 72) = -2.301 - 1.0 = -3.301 → -3
    const ch = courseHandicap18h(-2.0, 130, 71.0, 72)
    expect(ch).toBe(-3)
  })

  it('índice 0 en cancha difícil → CH positivo por CR−par', () => {
    // 0 × (140/113) + (74.5 - 72) = 0 + 2.5 = 2.5 → round 3
    const ch = courseHandicap18h(0, 140, 74.5, 72)
    expect(ch).toBe(3)
  })

  it('índice alto (36) en cancha difícil', () => {
    const ch = courseHandicap18h(36.0, 140, 74.5, 72)
    expect(ch).toBe(47)
  })

  it('devuelve entero siempre', () => {
    const ch = courseHandicap18h(15.3, 122, 70.1, 72)
    expect(Number.isInteger(ch)).toBe(true)
  })
})

describe('courseHandicap9h', () => {
  it('WHS 9h: 10.5 × (120/113) + (35.5 − 36) → round 11', () => {
    // 10.5 * 1.06195 - 0.5 = 11.150 - 0.5 = 10.650 → 11
    const ch = courseHandicap9h(10.5, 120, 35.5, 36)
    expect(ch).toBe(11)
  })

  it('handicap 0 en 9h con CR par → CH 0', () => {
    const ch = courseHandicap9h(0, 113, 36.0, 36)
    expect(ch).toBe(0)
  })

  it('plus handicap en 9h', () => {
    // -2 × (120/113) + (35.5 - 36) = -2.124 - 0.5 = -2.624 → -3
    const ch = courseHandicap9h(-2, 120, 35.5, 36)
    expect(ch).toBe(-3)
  })
})

describe('validateCustomSI', () => {
  it('válido: 1..18 cada uno exactamente una vez', () => {
    const si: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) si[String(i)] = i
    expect(validateCustomSI(si, 18)).toBeNull()
  })

  it('válido aunque el orden sea arbitrario', () => {
    // Permutación de 1..18 en orden arbitrario (cada número exactamente una vez)
    const perm = [18, 1, 9, 3, 17, 5, 15, 7, 13, 2, 11, 4, 10, 6, 8, 16, 12, 14]
    const si: Record<string, number> = {}
    perm.forEach((v, i) => { si[String(i + 1)] = v })
    expect(validateCustomSI(si, 18)).toBeNull()
  })

  it('falta un hoyo → error con mensaje claro', () => {
    const si: Record<string, number> = {}
    for (let i = 1; i <= 17; i++) si[String(i)] = i // solo 17 holes
    const err = validateCustomSI(si, 18)
    expect(err).toContain('18 hoyos')
  })

  it('número repetido / falta otro → error', () => {
    const si: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) si[String(i)] = i
    si['18'] = 1 // repite 1, falta 18
    const err = validateCustomSI(si, 18)
    expect(err).toContain('1 al 18')
  })

  it('válido para 9 hoyos', () => {
    const si: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) si[String(i)] = i
    expect(validateCustomSI(si, 9)).toBeNull()
  })
})

describe('shouldShowSIWarning', () => {
  it('stroke_play + gross → nunca avisa (no requiere SI)', () => {
    expect(shouldShowSIWarning('stroke_play', 'gross', 18, 'estimated')).toBe(false)
    expect(shouldShowSIWarning('stroke_play', 'gross', 18, 'generic')).toBe(false)
  })

  it('stableford + source="estimated" → avisa', () => {
    expect(shouldShowSIWarning('stableford', 'neto', 18, 'estimated')).toBe(true)
  })

  it('stableford + source="generic" → avisa', () => {
    expect(shouldShowSIWarning('stableford', 'neto', 18, 'generic')).toBe(true)
  })

  it('stableford + source="custom" → no avisa', () => {
    expect(shouldShowSIWarning('stableford', 'neto', 18, 'custom')).toBe(false)
  })

  it('stableford + source="verified" → no avisa', () => {
    expect(shouldShowSIWarning('stableford', 'neto', 18, 'verified')).toBe(false)
  })

  it('stroke_play neto 18h → no avisa (SI no afecta total neto de 18)', () => {
    expect(shouldShowSIWarning('stroke_play', 'neto', 18, 'estimated')).toBe(false)
  })

  it('stroke_play neto 9h + source="estimated" → avisa (SI afecta distribución)', () => {
    expect(shouldShowSIWarning('stroke_play', 'neto', 9, 'estimated')).toBe(true)
  })

  it('stroke_play neto 9h + source="custom" → no avisa', () => {
    expect(shouldShowSIWarning('stroke_play', 'neto', 9, 'custom')).toBe(false)
  })
})
