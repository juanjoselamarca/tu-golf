// src/golf/leaderboard/scoring-handicap.ts
//
// FUENTE ÚNICA del handicap con el que los boards individuales reparten golpes.
//
// El neto de un torneo lo persiste el organizador (`organizador/[slug]/scoring`)
// con `resolveScoringCourseHcp`: en torneos `hcp_calc_mode='whs'` eso es el
// COURSE HANDICAP por tee, no el índice. Mientras el board leía la columna
// `rounds.total_net` la coincidencia era gratis; ahora que el board deriva el
// neto de los hoyos tiene que usar exactamente el mismo handicap, o la tabla
// pública contradice a la pantalla del organizador.
//
// Cuánto importa: en Los Leones (slope 142, CR 75.1, par 72) un índice 12.0 da
// course handicap 18 — seis golpes por jugador, suficiente para dar vuelta un
// leaderboard. Y la migración `20260528_tournaments_hcp_calc_mode.sql` dejó
// DEFAULT 'whs', así que todo torneo nuevo nace en ese modo.

import {
  resolveScoringCourseHcp,
  type TournamentForCourseHcp,
} from '@/golf/core/compute-player-course-hcp'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

/** playerId → course handicap de SCORING (el que reparte golpes por hoyo). */
export type ScoringHandicaps = ReadonlyMap<string, number>

/**
 * Lo mínimo que necesita un jugador para resolver su handicap de scoring.
 *
 * A propósito NO incluye `categories`: el default de tee por categoría
 * (`categories.default_tee_color`) nunca se cableó a la BD, y pedirlo obligaría
 * a cada board a arrastrar una forma de `categories` distinta de la que ya usa
 * para mostrar el nombre de la categoría.
 */
export interface PlayerForScoringHcp {
  id: string
  handicap_at_registration: number | null
  tee_id: string | null
}

export interface TournamentForScoringHcp extends TournamentForCourseHcp {
  /** 'whs' → course handicap por tee. Cualquier otro valor → índice crudo. */
  hcp_calc_mode: string | null
}

/**
 * Resuelve el handicap de scoring de cada jugador del path legacy (`players`).
 *
 * @param players     jugadores con `id`, `handicap_at_registration` y `tee_id`
 * @param tournament  modo de cálculo + tee global + ratings de la cancha
 * @param courseTees  tees de la cancha (slope/CR por tee). Vacío → índice crudo
 * @param parTotal    par de la cancha usado por la fórmula WHS
 * @param holeCount   hoyos de la ronda (9 → usa ratings de 9h)
 */
export function buildScoringHandicaps(
  players: readonly PlayerForScoringHcp[],
  tournament: TournamentForScoringHcp,
  courseTees: CourseTeeRow[],
  parTotal: number,
  holeCount: number,
): ScoringHandicaps {
  const out = new Map<string, number>()
  for (const p of players) {
    const forHcp = {
      handicap_at_registration: p.handicap_at_registration,
      tee_id: p.tee_id,
    }
    out.set(
      p.id,
      resolveScoringCourseHcp(tournament.hcp_calc_mode, forHcp, tournament, courseTees, parTotal, holeCount),
    )
  }
  return out
}

/**
 * Handicap de scoring de un jugador, con el mismo fallback en todos los boards.
 *
 * Sin entrada en el mapa cae al índice crudo, que es el comportamiento
 * histórico (`hcp_calc_mode` distinto de 'whs').
 */
export function scoringHandicapOf(
  handicaps: ScoringHandicaps | undefined,
  playerId: string,
  handicapAtRegistration: number | null,
): number {
  return handicaps?.get(playerId) ?? handicapAtRegistration ?? 0
}
