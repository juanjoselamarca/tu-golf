import { describe, it, expect } from 'vitest'
import { computePlayerCourseHcp } from './compute-player-course-hcp'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

const teeAzul: CourseTeeRow = { id: 'tee-azul', nombre: 'Azul', rating: 72.1, slope: 131, yardaje_total: 6573, genero: null }
const teeRojo: CourseTeeRow = { id: 'tee-rojo', nombre: 'Rojo', rating: 68.5, slope: 119, yardaje_total: 5200, genero: 'female' }
const teeBlanco: CourseTeeRow = { id: 'tee-blanco', nombre: 'Blanco', rating: 70.0, slope: 125, yardaje_total: 6100, genero: null }
const allTees = [teeAzul, teeRojo, teeBlanco]

const baseTournament = {
  tees: 'Azul',
  courses: { par_total: 72, slope_rating: 131, course_rating: 72.1 },
}

const basePlayer = {
  handicap_at_registration: 15.0,
  tee_id: null,
  categories: null,
}

describe('computePlayerCourseHcp', () => {
  it('uses manual tee_id when assigned', () => {
    const player = { ...basePlayer, tee_id: 'tee-rojo' }
    // CH = 15 × (119/113) + (68.5 - 72) = 15 × 1.053 + (-3.5) = 15.80 - 3.5 = 12.30 → round = 12
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 72, 18)
    expect(ch).toBe(12)
  })

  it('uses category default tee when no manual tee', () => {
    const player = { ...basePlayer, categories: { default_tee_color: 'Rojo' } }
    // Same as above — resolves to Rojo via category
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 72, 18)
    expect(ch).toBe(12)
  })

  it('falls back to global tournament tee', () => {
    // No manual tee, no category → falls back to tournament.tees = 'Azul'
    // CH = 15 × (131/113) + (72.1 - 72) = 15 × 1.159 + 0.1 = 17.39 + 0.1 = 17.49 → round = 17
    const ch = computePlayerCourseHcp(basePlayer, baseTournament, allTees, 72, 18)
    expect(ch).toBe(17)
  })

  it('falls back to course-level ratings when no tee resolved', () => {
    const tournament = { tees: null, courses: { par_total: 72, slope_rating: 131, course_rating: 72.1 } }
    // No tees matched → uses course-level slope/CR
    const ch = computePlayerCourseHcp(basePlayer, tournament, [], 72, 18)
    expect(ch).toBe(17)
  })

  it('returns raw index when no slope/CR available', () => {
    const tournament = { tees: null, courses: null }
    const ch = computePlayerCourseHcp(basePlayer, tournament, [], 72, 18)
    expect(ch).toBe(15)
  })

  it('returns 0 for null handicap', () => {
    const player = { ...basePlayer, handicap_at_registration: null }
    const tournament = { tees: null, courses: null }
    const ch = computePlayerCourseHcp(player, tournament, [], 72, 18)
    expect(ch).toBe(0)
  })

  it('uses 9h formula with halved 18h CR when no front_course_rating', () => {
    // No front ratings → CR_9h = 68.5 / 2 = 34.25, slope stays 119
    // CH_9h = 15 × (119/113) + (34.25 - 36) = 15 × 1.053 + (-1.75) = 15.80 - 1.75 = 14.05 → round = 14
    const player = { ...basePlayer, tee_id: 'tee-rojo' }
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 36, 9)
    expect(ch).toBe(14)
  })

  it('uses front_course_rating and front_slope_rating for 9-hole when available', () => {
    const teeWith9h: CourseTeeRow = {
      ...teeRojo,
      front_course_rating: 34.5,
      front_slope_rating: 115,
    }
    // CH_9h = 15 × (115/113) + (34.5 - 36) = 15 × 1.018 + (-1.5) = 15.27 - 1.5 = 13.77 → round = 14
    const player = { ...basePlayer, tee_id: 'tee-rojo' }
    const ch = computePlayerCourseHcp(player, baseTournament, [teeWith9h], 36, 9)
    expect(ch).toBe(14)
  })

  it('manual tee overrides category and global', () => {
    const player = {
      ...basePlayer,
      tee_id: 'tee-blanco',
      categories: { default_tee_color: 'Rojo' },
    }
    // Blanco: CH = 15 × (125/113) + (70.0 - 72) = 15 × 1.106 + (-2) = 16.59 - 2 = 14.59 → round = 15
    const ch = computePlayerCourseHcp(player, baseTournament, allTees, 72, 18)
    expect(ch).toBe(15)
  })

  it('handles tee with null slope gracefully', () => {
    const teeNoSlope: CourseTeeRow = { id: 'tee-ns', nombre: 'NoSlope', rating: null, slope: null, yardaje_total: 5000, genero: null }
    const player = { ...basePlayer, tee_id: 'tee-ns' }
    // Resolved tee has no slope → falls back to course-level
    const ch = computePlayerCourseHcp(player, baseTournament, [teeNoSlope], 72, 18)
    expect(ch).toBe(17) // Uses course.slope_rating/course_rating
  })

  it('course-level fallback halves CR for 9-hole', () => {
    const tournament = { tees: null, courses: { par_total: 72, slope_rating: 131, course_rating: 72.1 } }
    // CR_9h = 72.1 / 2 = 36.05, slope = 131
    // CH_9h = 15 × (131/113) + (36.05 - 36) = 15 × 1.159 + 0.05 = 17.39 + 0.05 = 17.44 → round = 17
    const ch = computePlayerCourseHcp(basePlayer, tournament, [], 36, 9)
    expect(ch).toBe(17)
  })
})
