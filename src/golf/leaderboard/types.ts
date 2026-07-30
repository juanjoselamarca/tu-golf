// src/golf/leaderboard/types.ts
//
// Tipos compartidos para la construcción de leaderboards de torneo.
// El motor calcula gross y neto en paralelo: la UI decide cuál renderizar
// (vía tab Gross/Neto, salvo match_play donde el modo es exclusivo).

import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

export interface LeaderboardEntry {
  name: string
  /** Course handicap de SCORING (9h en rondas de 9h: reparte strokes/neto). */
  handicap: number
  /** Course handicap COMPLETO (18h) para mostrar. Opcional: cae a `handicap`. */
  hcpDisplay?: number
  grossTotal: number
  netTotal: number
  stablefordTotal: number
  /** Puntos stableford por hoyo (solo formato stableford). */
  stablefordScores?: number[]
  /** Score vs par para el modo elegido por el torneo (mostrado en TournamentTabs). */
  vsPar: number
  holesPlayed: number
  /**
   * Par acumulado de los hoyos REALMENTE jugados (`parOfPlayedHoles`). Es la
   * referencia contra la que se mide "a par" mientras la vuelta está a medias:
   * usar el par de la vuelta completa pinta al que jugó menos como líder.
   * Opcional por compatibilidad; si falta, `rankEntries` cae a `parTotal`.
   */
  parPlayed?: number
  /** ID del jugador en su tabla de origen. Permite a la UI enlazar/filtrar. */
  id?: string
  /** Cantidad de rondas con datos para este jugador. Multi-round: vsPar =
   *  cumulNet - parTotal * roundsPlayed. Default 1 para torneos single-round. */
  roundsPlayed?: number
  /** Categoría legible para Player.cat. Si no se especifica, 'General'. */
  cat?: string
  scores: (number | null)[]
  status: 'live' | 'F'
  tieAnnotation?: string
}

export interface CourseHole {
  numero: number
  par: number
  stroke_index: number
}

export interface TourneyStats {
  bestName:    string
  bestNet:     number
  avgNet:      number
  eagles:      number
  birdies:     number
  hardestHole: { hole: number; avg: number } | null
  easiestHole: { hole: number; avg: number } | null
}

/**
 * Todo lo que hace falta para resolver el COURSE HANDICAP de un jugador de torneo
 * con el MISMO motor que el scorer del organizador (`resolveScoringCourseHcp`).
 *
 * Existe porque el board público repartía golpes con el ÍNDICE crudo mientras la
 * tarjeta en cancha ya repartía con el course handicap WHS: en una vuelta de 9
 * hoyos el board daba ~2× los golpes de la tarjeta y las dos pantallas del mismo
 * torneo mostraban netos distintos. Un concepto, una fuente: acá viajan los datos,
 * la CUENTA es la de `@/golf/core/compute-player-course-hcp`, sin copiarla.
 */
export interface LegacyHcpContext {
  /** `tournaments.hcp_calc_mode`. Sólo 'whs' convierte; cualquier otro valor deja
   *  el índice crudo — es el gate que congela los torneos viejos/en curso. */
  mode: string | null
  /** `tournaments.tees` — tee global del torneo (último escalón del fallback). */
  tees: string | null
  /** Ratings de la cancha del torneo (fallback si el tee del jugador no resuelve). */
  course: { par_total: number; slope_rating: number; course_rating: number } | null
  /** Tees del catálogo de esa cancha, para resolver el tee por jugador. */
  courseTees: CourseTeeRow[]
}

export interface TournamentLeaderboardContext {
  parTotal: number
  totalHoyos: number
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  courseHoles: CourseHole[]
  /** Datos para el course handicap por jugador. Si falta, el board cae al índice
   *  crudo — exactamente el comportamiento de un torneo con `hcp_calc_mode` ≠ 'whs'. */
  hcp?: LegacyHcpContext | null
}
