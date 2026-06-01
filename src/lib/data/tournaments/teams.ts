/**
 * teams.ts — capa de datos para equipos a nivel torneo.
 *
 * Cierra la promesa rota descubierta en la auditoría FTUE 22-may (PR #41):
 * el wizard "Organizar Torneo Equipos" deja al usuario configurar Best Ball
 * / Scramble / Foursome pero no había schema ni acceso para materializar
 * equipos. Paso 1 (migración `20260525_tournament_teams.sql`) creó las
 * tablas; este módulo es paso 2 del plan
 * `docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md`.
 *
 * Convenciones de la capa `src/lib/data/`:
 * - Cada función recibe el `SupabaseClient` como primer argumento. El caller
 *   decide qué cliente usar (server / browser / admin) y el módulo permanece
 *   testeable inyectando un mock.
 * - Errores: `captureError` + `throw`. CERO `console.*`.
 * - Sin lógica de UI ni hooks — esto es solo acceso a datos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import type { Player } from '@/lib/supabase'
import type {
  Team,
  TeamMember,
  TeamWithMembers,
} from '@/lib/types/tournament'

const TEAM_COLUMNS = 'id, tournament_id, name, color, position, created_at'
const MEMBER_COLUMNS = 'id, team_id, player_id, position, created_at'

export interface CreateTeamInput {
  name: string
  position: number
  color?: string | null
}

export type UpdateTeamFields = Partial<
  Pick<Team, 'name' | 'color' | 'position'>
>

/** Lista los equipos de un torneo, ordenados por `position` ascendente. */
export async function listTeams(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<Team[]> {
  const { data, error } = await supabase
    .from('tournament_teams')
    .select(TEAM_COLUMNS)
    .eq('tournament_id', tournamentId)
    .order('position', { ascending: true })

  if (error) {
    await captureError(error, {
      context: 'data.tournaments.teams.listTeams',
      meta: { tournamentId },
    })
    throw error
  }
  return (data ?? []) as Team[]
}

/** Devuelve un equipo y sus miembros expandidos a `Player`. `null` si el equipo no existe. */
export async function getTeamWithMembers(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamWithMembers | null> {
  const { data: team, error: teamError } = await supabase
    .from('tournament_teams')
    .select(TEAM_COLUMNS)
    .eq('id', teamId)
    .maybeSingle()

  if (teamError) {
    await captureError(teamError, {
      context: 'data.tournaments.teams.getTeamWithMembers.team',
      meta: { teamId },
    })
    throw teamError
  }
  if (!team) return null

  const { data: rows, error: membersError } = await supabase
    .from('tournament_team_members')
    .select('position, players:player_id(*)')
    .eq('team_id', teamId)
    .order('position', { ascending: true, nullsFirst: false })

  if (membersError) {
    await captureError(membersError, {
      context: 'data.tournaments.teams.getTeamWithMembers.members',
      meta: { teamId },
    })
    throw membersError
  }

  const members: Player[] = (
    (rows ?? []) as unknown as Array<{ players: Player | null }>
  )
    .map((row) => row.players)
    .filter((p): p is Player => p !== null)

  return { team: team as Team, members }
}

/** Crea un equipo nuevo. UNIQUE(tournament_id, position) y UNIQUE(tournament_id, name)
 * pueden hacer fallar el insert — el error original se propaga al caller. */
export async function createTeam(
  supabase: SupabaseClient,
  tournamentId: string,
  input: CreateTeamInput,
): Promise<Team> {
  const { data, error } = await supabase
    .from('tournament_teams')
    .insert({
      tournament_id: tournamentId,
      name: input.name,
      position: input.position,
      color: input.color ?? null,
    })
    .select(TEAM_COLUMNS)
    .single()

  if (error) {
    await captureError(error, {
      context: 'data.tournaments.teams.createTeam',
      meta: { tournamentId, position: input.position, name: input.name },
    })
    throw error
  }
  return data as Team
}

/** Actualiza campos puntuales del equipo (name, color o position). */
export async function updateTeam(
  supabase: SupabaseClient,
  teamId: string,
  fields: UpdateTeamFields,
): Promise<Team> {
  const { data, error } = await supabase
    .from('tournament_teams')
    .update(fields)
    .eq('id', teamId)
    .select(TEAM_COLUMNS)
    .single()

  if (error) {
    await captureError(error, {
      context: 'data.tournaments.teams.updateTeam',
      meta: { teamId, fields },
    })
    throw error
  }
  return data as Team
}

/** Borra un equipo. El cascade de la FK elimina miembros automáticamente. */
export async function deleteTeam(
  supabase: SupabaseClient,
  teamId: string,
): Promise<void> {
  const { error } = await supabase
    .from('tournament_teams')
    .delete()
    .eq('id', teamId)

  if (error) {
    await captureError(error, {
      context: 'data.tournaments.teams.deleteTeam',
      meta: { teamId },
    })
    throw error
  }
}

/** Asigna un jugador a un equipo. `UNIQUE(player_id)` en BD impide doble
 * asignación: si el jugador ya está en cualquier equipo del torneo, este
 * insert falla y el error sube al caller (que puede llamar antes a
 * `removeMemberByPlayerId` si quiere reasignar). */
export async function assignPlayerToTeam(
  supabase: SupabaseClient,
  teamId: string,
  playerId: string,
): Promise<TeamMember> {
  const { data, error } = await supabase
    .from('tournament_team_members')
    .insert({ team_id: teamId, player_id: playerId })
    .select(MEMBER_COLUMNS)
    .single()

  if (error) {
    await captureError(error, {
      context: 'data.tournaments.teams.assignPlayerToTeam',
      meta: { teamId, playerId },
    })
    throw error
  }
  return data as TeamMember
}

/** Remueve al jugador de cualquier equipo del torneo. Idempotente: si el
 * jugador no estaba asignado, no falla y no afecta filas. */
export async function removeMemberByPlayerId(
  supabase: SupabaseClient,
  playerId: string,
): Promise<void> {
  const { error } = await supabase
    .from('tournament_team_members')
    .delete()
    .eq('player_id', playerId)

  if (error) {
    await captureError(error, {
      context: 'data.tournaments.teams.removeMemberByPlayerId',
      meta: { playerId },
    })
    throw error
  }
}
