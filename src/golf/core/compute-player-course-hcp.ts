// src/golf/core/compute-player-course-hcp.ts
//
// Computes the WHS course handicap for a player based on their resolved tee.
// Composes resolvePlayerTee + courseHandicap18h/9h into a single call.

import { resolvePlayerTee, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { courseHandicap18h, courseHandicap9h } from '@/golf/core/stroke-index'
import {
  indiceDe9Hoyos,
  handicapSinDatosDeCancha,
  ratingsDe9DelTee,
  type TeeRatings,
} from '@/golf/core/course-handicap'
import {
  courseRatingEnEscalaDe9,
  hoyosDeUnaVuelta,
  parDeVariasVueltas,
  parEnEscalaDe9,
  sumaDeVueltas,
  vueltasDeLaRonda,
} from '@/golf/courses/vueltas'
import { ratingEsCreible } from '@/golf/courses/rating-coherente'

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
 * Compute course handicap for a player using their resolved tee's slope/CR.
 * Fallback chain:
 *   1. Resolved tee slope/CR (manual → category → global)
 *   2. Course-level slope/CR (from tournament.courses)
 *   3. Camino seguro: el índice del jugador (la mitad si son 9 hoyos)
 *
 * GUARDARRAIL: cada eslabón se usa SÓLO si su rating es creíble contra el par
 * a la misma escala (ver `@/golf/courses/rating-coherente`). Un rating que
 * miente no se usa: se pasa al siguiente eslabón, y si ninguno sirve se cae al
 * camino seguro. Nunca se inventa un número.
 *
 * Ejemplo real: C.G. Río Blanco (par 35) tiene sus 3 tees con rating 55 —
 * cargado en escala de 18 hoyos porque la validación de la base rechaza el
 * rating real de 9 (~35). Sin guardarrail, un jugador de índice 12 recibía
 * `round(6 × 113/113 + (55 − 35))` = +26 golpes en una vuelta de 9 hoyos.
 */
export function computePlayerCourseHcp(
  player: PlayerForCourseHcp,
  tournament: TournamentForCourseHcp,
  courseTees: CourseTeeRow[],
  parTotal: number,
  holeCount: number,
): number {
  const index = player.handicap_at_registration ?? 0

  // Señal de escala para el Course Rating: el par PROPIO de la cancha, no el
  // argumento `parTotal`. `parTotal` es el par de la RONDA y algunos callers ya
  // lo pasan dividido (36 para una vuelta de 9 en una cancha de 18), así que un
  // 36 es ambiguo: puede ser media cancha de 72 o una cancha de 9 hoyos reales.
  // `courses.par_total` nunca es ambiguo — es la escala en la que están
  // publicados el rating del tee y el de la cancha.
  const parDeLaCancha = tournament.courses?.par_total ?? parTotal

  // Una cancha de 9 hoyos jugada a 18 se recorre DOS VECES. Su Course Rating y
  // su par son los de UNA vuelta: hay que sumarlos, no medirlos contra 18 hoyos
  // de score. Antes esta rama comparaba el rating de 9 contra un par de 18
  // inflado a par 4, el guardarrail lo leía como dato incoherente y toda la
  // cancha caía al índice crudo — aunque su dato estuviera perfecto.
  const vueltas = vueltasDeLaRonda(hoyosDeUnaVuelta(parDeLaCancha), holeCount)
  // El par de la ronda cuando la cancha se recorre varias veces. MISMA fuente
  // que `resolverCourseData` (`parDeVariasVueltas`): el par propio de la cancha
  // por la cantidad de vueltas, no el `parTotal` que llega. Si cada motor se
  // creyera el par que le pasan, el board y la tarjeta volverían a mostrar netos
  // distintos para el mismo jugador. Ver el doc de `parDeVariasVueltas`.
  const parDeLaRonda = parDeVariasVueltas(parDeLaCancha, vueltas)

  if (courseTees.length > 0) {
    const { tee } = resolvePlayerTee({
      playerTeeId: player.tee_id,
      categoryDefaultTeeColor: player.categories?.default_tee_color ?? null,
      tournamentTeesGlobal: tournament.tees,
      courseTees,
    })

    if (tee?.slope && tee?.rating) {
      if (holeCount <= 9) {
        // Fuente única con `resolverCourseData`: mismo criterio campo por campo.
        const { slope: slope9, courseRating: cr9 } = ratingsDe9DelTee(tee as TeeRatings, parDeLaCancha)
        const par9 = parEnEscalaDe9(parTotal)
        if (ratingEsCreible({ courseRating: cr9, par: par9, holes: 9 })) {
          return courseHandicap9h(indiceDe9Hoyos(index), slope9, cr9, par9)
        }
      } else if (vueltas > 1) {
        // Cancha de 9 jugada a 18: CR de una vuelta, sumado. El índice va ENTERO
        // (es una vuelta de 18) y el slope no se escala (es adimensional).
        const unaVuelta = ratingsDe9DelTee(tee as TeeRatings, parDeLaCancha)
        const cr = sumaDeVueltas(unaVuelta.courseRating, vueltas)
        if (ratingEsCreible({ courseRating: cr, par: parDeLaRonda, holes: holeCount })) {
          return courseHandicap18h(index, unaVuelta.slope, cr, parDeLaRonda)
        }
      } else if (ratingEsCreible({ courseRating: tee.rating, par: parTotal, holes: holeCount })) {
        return courseHandicap18h(index, tee.slope, tee.rating, parTotal)
      }
    }
  }

  // Fallback: course-level ratings
  const course = tournament.courses
  if (course?.slope_rating && course?.course_rating) {
    if (holeCount <= 9) {
      // Halve course-level CR for 9-hole estimate — salvo que la cancha ya sea de 9.
      const cr9 = courseRatingEnEscalaDe9(course.course_rating, parDeLaCancha)
      const par9 = parEnEscalaDe9(parTotal)
      if (ratingEsCreible({ courseRating: cr9, par: par9, holes: 9 })) {
        return courseHandicap9h(indiceDe9Hoyos(index), course.slope_rating, cr9, par9)
      }
    } else if (vueltas > 1) {
      const cr = sumaDeVueltas(courseRatingEnEscalaDe9(course.course_rating, parDeLaCancha), vueltas)
      if (ratingEsCreible({ courseRating: cr, par: parDeLaRonda, holes: holeCount })) {
        return courseHandicap18h(index, course.slope_rating, cr, parDeLaRonda)
      }
    } else if (
      ratingEsCreible({ courseRating: course.course_rating, par: parTotal, holes: holeCount })
    ) {
      return courseHandicap18h(index, course.slope_rating, course.course_rating, parTotal)
    }
  }

  return handicapSinDatosDeCancha(index, holeCount <= 9)
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
