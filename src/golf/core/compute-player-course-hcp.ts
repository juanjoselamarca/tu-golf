// src/golf/core/compute-player-course-hcp.ts
//
// Computes the WHS course handicap for a player based on their resolved tee.
// Composes resolvePlayerTee + courseHandicap18h/9h into a single call.

import { resolvePlayerTee, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { courseHandicap18h, courseHandicap9h } from '@/golf/core/stroke-index'
import { indiceDe9Hoyos } from '@/golf/core/course-handicap'

export interface PlayerForCourseHcp {
  handicap_at_registration: number | null
  tee_id: string | null
  // Reservado: default de tee por categoría. La columna categories.default_tee_color
  // NO existe en prod hoy (el feature nunca se cableó a la BD), así que este paso del
  // fallback está latente. Opcional para que los callers que no lo traen no revienten
  // el tipo — ver scoring/page.tsx, que dejó de pedir el embed que causaba HTTP 400.
  categories?: { default_tee_color: string | null } | null
}

export interface TournamentForCourseHcp {
  tees: string | null
  courses: { par_total: number; slope_rating: number; course_rating: number } | null
}

/**
 * Par de 9 hoyos, defensivo contra el par de 18.
 *
 * Los callers históricos pasan `courses.par_total` (72) aunque la ronda sea de
 * 9 hoyos. Combinado con el Course Rating de 9h (~36) eso da `(CR − par) ≈ −36`
 * y devuelve course handicaps NEGATIVOS: en COPA LB PADRE E HIJO 2026 un índice
 * 12 resolvía a −22, y un jugador que hacía par bruto salía "+9" porque el motor
 * lo trataba como jugador plus. Un par ≤50 nunca es un par de 18 hoyos, así que
 * se respeta; uno mayor se interpreta como par de 18 y se parte al medio.
 *
 * Los callers que tienen `course_holes` a mano deberían pasar el par REAL de la
 * ronda con `parDeLosHoyosJugados` — esto es el piso, no el camino ideal.
 */
function par9h(par: number): number {
  return par > 50 ? Math.round(par / 2) : par
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
        return courseHandicap9h(indiceDe9Hoyos(index), slope9, cr9, par9h(parTotal))
      }
      return courseHandicap18h(index, tee.slope, tee.rating, parTotal)
    }
  }

  // Fallback: course-level ratings
  const course = tournament.courses
  if (course?.slope_rating && course?.course_rating) {
    if (holeCount <= 9) {
      // Halve course-level CR for 9-hole estimate
      return courseHandicap9h(indiceDe9Hoyos(index), course.slope_rating, course.course_rating / 2, par9h(parTotal))
    }
    return courseHandicap18h(index, course.slope_rating, course.course_rating, parTotal)
  }

  return index
}

/**
 * Gate del cálculo de neto por torneo (decisión Juanjo 28-may-2026).
 *
 * PR #73 (tee-por-admin) cableó el neto a course handicap WHS para todos los torneos,
 * lo que alteraría el neto de torneos in_progress a mitad de evento. Decisión: WHS solo
 * para torneos NUEVOS; los existentes congelan el cálculo previo (índice crudo).
 *
 * - mode === 'whs'  → course handicap WHS por tee (computePlayerCourseHcp).
 * - cualquier otro  → índice crudo (handicap_at_registration). Default seguro: si la
 *   columna falta/llega null, no se altera el comportamiento histórico del torneo.
 */
export function resolveScoringCourseHcp(
  mode: string | null | undefined,
  player: PlayerForCourseHcp,
  tournament: TournamentForCourseHcp,
  courseTees: CourseTeeRow[],
  parTotal: number,
  holeCount: number,
): number {
  if (mode !== 'whs') return player.handicap_at_registration ?? 0
  return computePlayerCourseHcp(player, tournament, courseTees, parTotal, holeCount)
}
