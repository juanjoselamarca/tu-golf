// src/lib/data/tournaments/players.ts
//
// Capa de datos para la tabla `players` (inscripciones a torneos).
// Centraliza queries que antes vivían directo en JugadoresPanel.tsx.
//
// Bug #6 inbox 25-may: agrega setPlayerTeeId para el modo manual.

import type { SupabaseClient } from '@supabase/supabase-js'

const PLAYERS_SELECT = `
  id, tournament_id, user_id, category_id, handicap_at_registration, status, tee_id,
  profiles:profiles!players_user_id_fkey ( id, name, indice ),
  categories:categories ( id, name, default_tee_color, gender )
`

export interface PlayerRow {
  id: string
  tournament_id: string
  user_id: string | null
  category_id: string | null
  handicap_at_registration: number | null
  status: string
  tee_id: string | null
  profiles: { id: string; name: string; indice: number | null } | null
  categories: { id: string; name: string; default_tee_color: string | null; gender: string | null } | null
}

export async function listPlayers(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players')
    .select(PLAYERS_SELECT)
    .eq('tournament_id', tournamentId)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PlayerRow[]
}

export async function setPlayerTeeId(
  supabase: SupabaseClient,
  playerId: string,
  teeId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ tee_id: teeId })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

export interface InscribePlayerInput {
  tournament_id: string
  profile_id: string
  category_id: string | null
  handicap_at_registration: number | null
}

export async function inscribePlayer(
  supabase: SupabaseClient,
  input: InscribePlayerInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('players')
    .insert([{
      tournament_id: input.tournament_id,
      profile_id: input.profile_id,
      category_id: input.category_id,
      handicap_at_registration: input.handicap_at_registration,
      status: 'approved',
    }])
  if (error) throw new Error(error.message)
  return { id: (data as unknown as Array<{ id: string }>)?.[0]?.id ?? '' }
}

export async function withdrawPlayer(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ status: 'withdrawn' })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

export async function disqualifyPlayer(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ status: 'disqualified' })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}
