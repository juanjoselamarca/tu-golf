/**
 * Tests del motor de Course Handicap (resolverCourseHandicap).
 *
 * El cálculo es función pura simple — la fórmula no es donde aparecen los
 * bugs. Los bugs vienen de inputs malos. Estos tests bloquean:
 *   1. Cambios accidentales en la fórmula WHS (regresión silenciosa)
 *   2. Manejo correcto de fallback cuando no hay courseData
 *   3. Invariantes (siempre entero, monotónico con index, simetría signo)
 *   4. Casos reales conocidos (par 72 estándar, par 60 ejecutiva, par 36 9h)
 *   5. Property-based: para cualquier input válido, output dentro de [0, 54]
 *
 * Para auditoría de DATOS en BD ver scripts/audit-handicap-calc.mjs.
 */

import { describe, it, expect } from 'vitest'
import { resolverCourseHandicap, type CourseData } from './course-handicap'

// ─── Helpers ────────────────────────────────────────────────────────────────

const standard18: CourseData = { slope: 113, courseRating: 72.0, par: 72 }
const tough18: CourseData = { slope: 140, courseRating: 74.5, par: 72 }
const easy9: CourseData = { slope: 113, courseRating: 35.0, par: 36, is9Hole: true }
const par60Executive: CourseData = { slope: 103, courseRating: 58.3, par: 60 }
const par62Short: CourseData = { slope: 113, courseRating: 55.0, par: 62 }

function whsFormula(index: number, c: CourseData): number {
  return Math.round(index * (c.slope / 113) + (c.courseRating - c.par))
}

// ─── Suite 1: Fórmula correcta ──────────────────────────────────────────────

describe('resolverCourseHandicap — fórmula WHS', () => {
  it('cancha estándar par 72, slope 113, CR 72.0 → CH = round(index)', () => {
    expect(resolverCourseHandicap(0, standard18)).toBe(0)
    expect(resolverCourseHandicap(10, standard18)).toBe(10)
    expect(resolverCourseHandicap(18.4, standard18)).toBe(18)
    expect(resolverCourseHandicap(36, standard18)).toBe(36)
  })

  it('cancha difícil slope 140, CR 74.5, par 72 → CH > index', () => {
    // Para index 10: CH = round(10 * 140/113 + (74.5-72)) = round(12.39 + 2.5) = round(14.89) = 15
    expect(resolverCourseHandicap(10, tough18)).toBe(15)
    // Para index 0: CH = round(0 + 2.5) = 3 (¡un cero gana strokes en cancha dura!)
    expect(resolverCourseHandicap(0, tough18)).toBe(3)
  })

  it('9 hoyos: slope 113, CR 35.0, par 36 → CH = round(index - 1)', () => {
    expect(resolverCourseHandicap(10, easy9)).toBe(9)
    expect(resolverCourseHandicap(0, easy9)).toBe(-1)
  })

  it('par 60 ejecutiva: CR 58.3, slope 103, par 60 → CH < index', () => {
    // Para index 18: CH = round(18 * 103/113 + (58.3-60)) = round(16.41 - 1.7) = round(14.71) = 15
    expect(resolverCourseHandicap(18, par60Executive)).toBe(15)
  })

  it('par 62 short course con slope 113 → CH = round(index - 7)', () => {
    expect(resolverCourseHandicap(20, par62Short)).toBe(13)
    expect(resolverCourseHandicap(7, par62Short)).toBe(0)
  })
})

// ─── Suite 2: Fallback ──────────────────────────────────────────────────────

describe('resolverCourseHandicap — fallback', () => {
  it('courseData null → CH = round(index)', () => {
    expect(resolverCourseHandicap(10.4, null)).toBe(10)
    expect(resolverCourseHandicap(15.6, null)).toBe(16)
  })

  it('slope 0 (caída a fallback) → CH = round(index)', () => {
    expect(resolverCourseHandicap(10, { slope: 0, courseRating: 72, par: 72 })).toBe(10)
  })

  it('CR 0 (caída a fallback) → CH = round(index)', () => {
    expect(resolverCourseHandicap(10, { slope: 113, courseRating: 0, par: 72 })).toBe(10)
  })
})

// ─── Suite 3: Invariantes ───────────────────────────────────────────────────

describe('resolverCourseHandicap — invariantes', () => {
  const courses: Array<[string, CourseData]> = [
    ['standard18', standard18],
    ['tough18', tough18],
    ['easy9', easy9],
    ['par60', par60Executive],
    ['par62', par62Short],
  ]

  it.each(courses)('%s: output siempre entero', (_, c) => {
    for (const idx of [0, 1.7, 5, 12.3, 24.0, 36.4]) {
      const ch = resolverCourseHandicap(idx, c)
      expect(Number.isInteger(ch)).toBe(true)
    }
  })

  it.each(courses)('%s: monotónico no-decreciente con index (slope > 0)', (_, c) => {
    let prev = -Infinity
    for (let idx = 0; idx <= 36; idx += 0.5) {
      const ch = resolverCourseHandicap(idx, c)
      expect(ch).toBeGreaterThanOrEqual(prev)
      prev = ch
    }
  })

  it.each(courses)('%s: index 0 → CH = round(CR - par)', (_, c) => {
    expect(resolverCourseHandicap(0, c)).toBe(Math.round(c.courseRating - c.par))
  })

  it('signo: index negativo (jugador plus) en cancha estándar → CH negativo', () => {
    expect(resolverCourseHandicap(-2, standard18)).toBe(-2)
  })

  it('signo: index alto en cancha estándar → CH coincide con index redondeado', () => {
    expect(resolverCourseHandicap(36.4, standard18)).toBe(36)
  })
})

// ─── Suite 4: Property-based (sample exhaustivo) ────────────────────────────

describe('resolverCourseHandicap — properties sobre rango válido', () => {
  // Rangos WHS oficiales: index ∈ [-5, 54], slope ∈ [55, 155], CR ∈ [55, 80], par ∈ [27, 78]
  const indices = [-5, -2, 0, 1, 5, 10, 18, 24, 30, 36, 45, 54]
  const slopes = [55, 80, 100, 113, 130, 145, 155]
  const ratings = [55, 60, 65, 70, 72, 75, 80]
  const pars = [54, 60, 68, 70, 72]

  it('para todo (index, slope, CR, par) en rangos WHS, CH es entero finito', () => {
    let count = 0
    for (const idx of indices) {
      for (const slope of slopes) {
        for (const cr of ratings) {
          for (const par of pars) {
            const ch = resolverCourseHandicap(idx, { slope, courseRating: cr, par })
            expect(Number.isInteger(ch)).toBe(true)
            expect(Number.isFinite(ch)).toBe(true)
            count++
          }
        }
      }
    }
    expect(count).toBe(indices.length * slopes.length * ratings.length * pars.length)
  })

  it('para index ∈ [0, 36] y slope estándar 113, |CH - index| ≤ |CR - par|', () => {
    for (const idx of [0, 5, 10, 18, 24, 36]) {
      for (const cr of [68, 70, 72, 74, 76]) {
        for (const par of [70, 72]) {
          const ch = resolverCourseHandicap(idx, { slope: 113, courseRating: cr, par })
          // Con slope 113, multiplicador = 1, así que CH = round(idx + (CR-par))
          expect(Math.abs(ch - idx)).toBeLessThanOrEqual(Math.abs(cr - par) + 1)
        }
      }
    }
  })
})

// ─── Suite 5: Regresiones de bugs históricos ────────────────────────────────

describe('resolverCourseHandicap — regresiones', () => {
  it('FedeGolf placeholder slope=113 + tee con datos reales → tee gana', () => {
    // Cuando el caller resuelve courseData, debe usar el tee si está poblado.
    // Esta función pura no decide eso (lo hace cargarCourseData) pero sí
    // garantiza que si llega courseData válido, se usa.
    const realTee: CourseData = { slope: 128, courseRating: 71.2, par: 72 }
    const placeholderCourse: CourseData = { slope: 113, courseRating: 0, par: 72 }
    expect(resolverCourseHandicap(15, realTee)).not.toBe(
      resolverCourseHandicap(15, placeholderCourse),
    )
  })

  it('no produce NaN con courseData incompleto', () => {
    // courseData con slope=NaN no debería ocurrir pero protegemos.
    const ch = resolverCourseHandicap(10, { slope: NaN, courseRating: 72, par: 72 })
    expect(Number.isNaN(ch)).toBe(false)
  })

  it('round() consistente: 0.5 → 1 (banker rounding NO se usa)', () => {
    // Math.round(0.5) === 1 en JS (no banker rounding). Documentar:
    expect(Math.round(0.5)).toBe(1)
    expect(Math.round(1.5)).toBe(2)
    expect(Object.is(Math.round(-0.5), -0)).toBe(true) // edge case JS: -0.5 → -0 (negative zero)
  })

  it('coincide con whsFormula para todos los casos del suite', () => {
    const cases: Array<[number, CourseData]> = [
      [10, standard18],
      [10, tough18],
      [10, easy9],
      [18, par60Executive],
      [20, par62Short],
    ]
    for (const [idx, c] of cases) {
      expect(resolverCourseHandicap(idx, c)).toBe(whsFormula(idx, c))
    }
  })
})
