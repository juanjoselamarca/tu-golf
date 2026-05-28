// src/golf/core/compute-player-course-hcp.ts
//
// Computes the WHS course handicap for a player based on their resolved tee.
// Composes resolvePlayerTee + courseHandicap18h/9h into a single call.

import { resolvePlayerTee, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { courseHandicap18h, courseHandicap9h } from '@/golf/core/stroke-index'

export interface PlayerForCourseHcp {
  handicap_at_registration: number | null
  tee_id: string | null
  categories: { default_tee_color: string | null } | null
}

export interface TournamentForCourseHcp {
  tees: string | null
  courses: { par_total: number; slope_rating: number; course_rating: number } | null
}

/**
 * Compute course handicap for a player using their resolved tee's slope/CR.
 * Fallback chain:
 *   1. Resolved tee slope/CR (manual → category → global)
 *   2. Course-level slope/CR (from tournament.courses)
 *   3. Raw handicap index (no conversion)
 */
export function computePlayerCourseHcp(
  player: PlayerForCourseHcp,
  tournament: TournamentForCourseHcp,
  courseTees: CourseTeeRow[],
  parTotal: number,
  holeCount: number,
): number {
  const index = player.handicap_at_registration ?? 0

  if (courseTees.length > 0) {
    const { tee } = resolvePlayerTee({
      playerTeeId: player.tee_id,
      categoryDefaultTeeColor: player.categories?.default_tee_color ?? null,
      tournamentTeesGlobal: tournament.tees,
      courseTees,
    })

    if (tee?.slope && tee?.rating) {
      if (holeCount <= 9) {
        // Use 9-hole specific ratings if available, otherwise halve the 18h CR
        const slope9 = tee.front_slope_rating ?? tee.slope
        const cr9 = tee.front_course_rating ?? tee.rating / 2
        return courseHandicap9h(index, slope9, cr9, parTotal)
      }
      return courseHandicap18h(index, tee.slope, tee.rating, parTotal)
    }
  }

  // Fallback: course-level ratings
  const course = tournament.courses
  if (course?.slope_rating && course?.course_rating) {
    if (holeCount <= 9) {
      // Halve course-level CR for 9-hole estimate
      return courseHandicap9h(index, course.slope_rating, course.course_rating / 2, parTotal)
    }
    return courseHandicap18h(index, course.slope_rating, course.course_rating, parTotal)
  }

  return index
}
