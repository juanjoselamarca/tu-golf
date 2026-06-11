import { describe, it, expect } from 'vitest'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'

describe('resolverCourseHandicap', () => {
  it('convierte índice a course handicap con slope/CR', () => {
    // Lomas de la Dehesa: slope 128, CR 71.2, par 72
    const ch = resolverCourseHandicap(10.5, { slope: 128, courseRating: 71.2, par: 72 })
    // 10.5 × (128/113) + (71.2 - 72) = 10.5 × 1.13274 - 0.8 = 11.094 → 11
    expect(ch).toBe(11)
  })

  it('devuelve entero siempre (no decimales)', () => {
    const ch = resolverCourseHandicap(6.0, { slope: 128, courseRating: 71.2, par: 72 })
    expect(Number.isInteger(ch)).toBe(true)
  })

  it('maneja índice 0 (scratch)', () => {
    const ch = resolverCourseHandicap(0, { slope: 128, courseRating: 71.2, par: 72 })
    // 0 × (128/113) + (71.2 - 72) = -0.8 → round(-0.8) = -1
    expect(ch).toBe(-1)
  })

  it('fallback: sin slope/CR devuelve round(índice)', () => {
    const ch = resolverCourseHandicap(10.5, null)
    expect(ch).toBe(11)
  })

  it('fallback: courseData con slope 0 devuelve round(índice)', () => {
    const ch = resolverCourseHandicap(10.5, { slope: 0, courseRating: 71.2, par: 72 })
    expect(ch).toBe(11)
  })

  it('maneja 9 hoyos: índice/2 (WHS) con CR/slope de 9', () => {
    // 9h WHS: (10.5/2) × (120/113) + (35.5 - 36) = 5.25 × 1.06195 - 0.5 = 5.08 → 5
    const ch = resolverCourseHandicap(10.5, { slope: 120, courseRating: 35.5, par: 36, is9Hole: true })
    expect(ch).toBe(5)
  })

  it('handicap alto: 36 index en cancha difícil', () => {
    // 36.0 × (140/113) + (74.5 - 72) = 36.0 × 1.23894 + 2.5 = 44.602 + 2.5 = 47.102 → 47
    const ch = resolverCourseHandicap(36.0, { slope: 140, courseRating: 74.5, par: 72 })
    expect(ch).toBe(47)
  })

  it('handicap negativo (plus handicap)', () => {
    // -2.0 × (130/113) + (71.0 - 72) = -2.0 × 1.15044 - 1.0 = -2.301 - 1.0 = -3.301 → -3
    const ch = resolverCourseHandicap(-2.0, { slope: 130, courseRating: 71.0, par: 72 })
    expect(ch).toBe(-3)
  })

  it('cancha fácil (slope bajo)', () => {
    // 15.0 × (100/113) + (68.0 - 72) = 15.0 × 0.88496 - 4.0 = 13.274 - 4.0 = 9.274 → 9
    const ch = resolverCourseHandicap(15.0, { slope: 100, courseRating: 68.0, par: 72 })
    expect(ch).toBe(9)
  })
})
