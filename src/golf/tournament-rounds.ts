// src/golf/tournament-rounds.ts
//
// FUENTE ÚNICA de "¿en qué cancha, con cuántos hoyos y qué día se juega la
// ronda N de este torneo?".
//
// Un torneo multi-ronda puede jugar cada ronda en una cancha distinta
// (decisión PM 25-sep-2026). Los datos viven en dos lugares por diseño, y
// esta función es la única que conoce la regla:
//
//   · Ronda 1 → `tournaments.course_id / hole_count / date_start`. Es lo que
//     leen las ~20 pantallas legacy y lo que edita el organizador en
//     `/organizador/[slug]/editar`. No se duplica en otra tabla para que no
//     haya dos copias que puedan discrepar.
//   · Rondas 2..N → una fila en `tournament_rounds`.
//
// Fallback EXPLÍCITO: si una ronda ≥ 2 no tiene fila (torneo creado antes de
// esta tabla), se juega en la cancha de la ronda 1 — que es lo que el motor
// asumía siempre hasta ahora. Se devuelve `source: 'tournament_fallback'`
// para que ningún caller lo confunda con configuración real.
//
// Sin I/O: pura y testeable. El fetch vive en `src/lib/data/tournaments/rounds.ts`.

/** Lo que `tournaments` sabe de la ronda 1. */
export interface TournamentRoundBase {
  course_id: string | null
  hole_count: number | null
  date_start: string | null
}

/** Una fila de `tournament_rounds` (rondas 2..N). */
export interface TournamentRoundRow {
  round_number: number
  course_id: string | null
  hole_count: number | null
  date: string | null
}

export type RoundConfigSource =
  /** Ronda 1: la configuración del torneo mismo. */
  | 'tournament'
  /** Ronda ≥ 2 con fila propia en `tournament_rounds`. */
  | 'tournament_rounds'
  /** Ronda ≥ 2 SIN fila: se hereda la cancha de la ronda 1 (torneos legacy). */
  | 'tournament_fallback'

export interface RoundPlayConfig {
  roundNumber: number
  courseId: string | null
  holeCount: number
  date: string | null
  source: RoundConfigSource
}

/** Hoyos por defecto cuando ni el torneo ni la ronda lo dicen. */
const HOLE_COUNT_FALLBACK = 18

export function resolveRoundPlayConfig(
  tournament: TournamentRoundBase,
  rows: readonly TournamentRoundRow[],
  roundNumber: number,
): RoundPlayConfig {
  const baseHoleCount = tournament.hole_count ?? HOLE_COUNT_FALLBACK

  if (roundNumber <= 1) {
    return {
      roundNumber: 1,
      courseId: tournament.course_id,
      holeCount: baseHoleCount,
      date: tournament.date_start,
      source: 'tournament',
    }
  }

  const row = rows.find((r) => r.round_number === roundNumber)
  if (!row) {
    return {
      roundNumber,
      courseId: tournament.course_id,
      holeCount: baseHoleCount,
      date: null,
      source: 'tournament_fallback',
    }
  }

  return {
    roundNumber,
    // Una fila con `course_id` null es configuración real ("esta ronda no tiene
    // cancha"), no un hueco: no se cae a la ronda 1. El wizard exige cancha
    // en todas las rondas (`validateGolfRules`), así que en la práctica no pasa.
    courseId: row.course_id,
    holeCount: row.hole_count ?? baseHoleCount,
    date: row.date,
    source: 'tournament_rounds',
  }
}

/** Las N rondas del torneo, resueltas con la misma regla. */
export function resolveAllRoundPlayConfigs(
  tournament: TournamentRoundBase & { total_rounds: number | null },
  rows: readonly TournamentRoundRow[],
): RoundPlayConfig[] {
  const total = Math.max(1, tournament.total_rounds ?? 1)
  return Array.from({ length: total }, (_, i) => resolveRoundPlayConfig(tournament, rows, i + 1))
}

/**
 * ¿La ronda N se juega en OTRA cancha (o con otra cantidad de hoyos) que la
 * ronda 1? Es la pregunta que hacen los boards para saber si necesitan un
 * contexto de handicap propio para esa ronda.
 */
export function roundDiffersFromBase(base: RoundPlayConfig, round: RoundPlayConfig): boolean {
  return round.courseId !== base.courseId || round.holeCount !== base.holeCount
}
