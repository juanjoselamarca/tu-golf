// src/lib/data/tournaments/rounds.ts
//
// Capa de datos de la configuración por ronda (`tournament_rounds`).
//
// Dos responsabilidades, ninguna de golf:
//   1. Mapeo `TournamentConfig.rounds` (wizard) → filas para insertar.
//      Sólo las rondas 2..N: la ronda 1 ya está en `tournaments`
//      (`mapTournamentForInsert`). Contrato único, testeable sin route.
//   2. Lectura: filas de un torneo + la resolución "qué se juega en la ronda N"
//      delegada a la fuente única `@/golf/tournament-rounds`.
//
// Bug P0 que cierra (inbox 652707d2): `create-tournament` insertaba estas filas
// en `rounds` (tarjetas por jugador), que no tiene `course_id` ni `date`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TournamentConfig } from '@/lib/draft/types'
import {
  resolveAllRoundPlayConfigs,
  resolveRoundPlayConfig,
  type RoundPlayConfig,
  type TournamentRoundRow,
} from '@/golf/tournament-rounds'

/**
 * Sólo lo que el motor LEE: cancha, fecha y hoyos. `tee_assignment_mode` es
 * del torneo (`tournaments.tees`, sincronizado a todas las rondas por
 * TeesSection) y `custom_si`/`notes` no los lee nadie — guardarlos sería una
 * segunda copia esperando divergir.
 */
export interface TournamentRoundInsertRow {
  tournament_id: string
  round_number: number
  date: string | null
  course_id: string | null
  hole_count: 9 | 18
}

/**
 * Filas de `tournament_rounds` para las rondas 2..N del config, ordenadas por
 * `round_number`. Vacío para torneos de una sola ronda. La ronda 1 NO va: su
 * cancha/fecha/hoyos son `tournaments.course_id/date_start/hole_count`.
 */
export function mapTournamentRoundsForInsert(
  config: Pick<TournamentConfig, 'rounds'>,
  tournamentId: string,
): TournamentRoundInsertRow[] {
  return [...config.rounds]
    .sort((a, b) => a.round_number - b.round_number)
    .filter((r) => r.round_number >= 2)
    .map((r) => ({
      tournament_id: tournamentId,
      round_number: r.round_number,
      date: r.date,
      course_id: r.course_id,
      hole_count: r.hole_count,
    }))
}

/** Cliente mínimo (sirve anon, ssr o service role). */
type MinimalClient = Pick<SupabaseClient, 'from'>

/** Columnas que necesita el resolver. Fuente única del SELECT. */
export const TOURNAMENT_ROUNDS_SELECT = 'round_number, course_id, hole_count, date'

/**
 * Filas de `tournament_rounds` del torneo (rondas 2..N), ordenadas.
 *
 * "No hay filas" y "no pude preguntar" NO son lo mismo: un error de la BD se
 * PROPAGA. Si se degradara a `[]`, el motor caería en silencio a la cancha de
 * la ronda 1 y repartiría el handicap de otra cancha — exactamente el número
 * equivocado que esta tabla existe para evitar.
 */
export async function fetchTournamentRoundRows(
  supabase: MinimalClient,
  tournamentId: string,
): Promise<TournamentRoundRow[]> {
  const { data, error } = await supabase
    .from('tournament_rounds')
    .select(TOURNAMENT_ROUNDS_SELECT)
    .eq('tournament_id', tournamentId)
    .order('round_number')
  if (error) throw new Error(`No se pudo leer la configuración de rondas: ${error.message}`)
  return (data ?? []) as unknown as TournamentRoundRow[]
}

/** Lo que `tournaments` aporta a la resolución. */
export interface TournamentForRounds {
  id: string
  course_id: string | null
  hole_count: number | null
  date_start: string | null
  total_rounds: number | null
}

/**
 * Qué se juega en la ronda `roundNumber`. Una sola lectura de
 * `tournament_rounds` (la de `tournaments` la trae el caller, que casi
 * siempre ya la tiene).
 */
export async function fetchRoundPlayConfig(
  supabase: MinimalClient,
  tournament: TournamentForRounds,
  roundNumber: number,
): Promise<RoundPlayConfig> {
  // La ronda 1 no necesita ir a la BD: es el torneo mismo.
  if (roundNumber <= 1) return resolveRoundPlayConfig(tournament, [], 1)
  const rows = await fetchTournamentRoundRows(supabase, tournament.id)
  return resolveRoundPlayConfig(tournament, rows, roundNumber)
}

/** Las N rondas del torneo resueltas. Una sola query. */
export async function fetchAllRoundPlayConfigs(
  supabase: MinimalClient,
  tournament: TournamentForRounds,
): Promise<RoundPlayConfig[]> {
  const total = tournament.total_rounds ?? 1
  const rows = total > 1 ? await fetchTournamentRoundRows(supabase, tournament.id) : []
  return resolveAllRoundPlayConfigs(tournament, rows)
}
