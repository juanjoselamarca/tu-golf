import { describe, it, expect } from 'vitest'
import { calcCourseHandicap } from './joinFlow'

describe('calcCourseHandicap', () => {
  it('rounds to nearest integer', () => {
    // indice 9.6, slope 130, rating 71.5, par 72
    // 9.6 * (130/113) + (71.5 - 72) = 11.0398... - 0.5 = 10.539... → 11
    expect(calcCourseHandicap(9.6, 130, 71.5, 72)).toBe(11)
  })

  it('handles zero indice', () => {
    expect(calcCourseHandicap(0, 113, 72, 72)).toBe(0)
  })

  it('handles indice that drops to negative course handicap', () => {
    // indice -2, slope 113, rating 72, par 72 → -2
    expect(calcCourseHandicap(-2, 113, 72, 72)).toBe(-2)
  })

  it('applies slope adjustment factor 113 baseline', () => {
    // slope > 113 amplifies, slope < 113 attenuates
    const indice = 18
    const par = 72
    const rating = 72
    const easyCourse = calcCourseHandicap(indice, 100, rating, par)
    const hardCourse = calcCourseHandicap(indice, 130, rating, par)
    expect(easyCourse).toBeLessThan(hardCourse)
  })

  it('matches the formula used by other modules of the app', () => {
    // sanity check: this should be the same as anywhere else
    // 14.5 * (125/113) + (71.2 - 72) = 16.040... - 0.8 = 15.24 → 15
    expect(calcCourseHandicap(14.5, 125, 71.2, 72)).toBe(15)
  })
})
