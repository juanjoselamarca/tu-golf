// src/lib/data/tournaments/groups.ts
//
// Capa de datos para tournament_groups + tournament_group_players.

import type { SupabaseClient } from '@supabase/supabase-js'

const GROUPS_SELECT = `
  id, tournament_id, name, tee_time, sort_order, ronda_libre_id,
  tournament_group_players ( player_id, players ( id, profiles ( name ) ) )
`

export interface GroupRow {
  id: string
  tournament_id: string
  name: string
  tee_time: string | null
  sort_order: number
  ronda_libre_id: string | null
  tournament_group_players?: Array<{
    player_id: string
    players: { id: string; profiles: { name: string } | null } | null
  }>
}

export async function listGroups(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<GroupRow[]> {
  const { data, error } = await supabase
    .from('tournament_groups')
    .select(GROUPS_SELECT)
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as GroupRow[]
}

export interface CreateGroupInput {
  tournament_id: string
  name: string
  tee_time: string | null
  sort_order: number
}

export async function createGroup(
  supabase: SupabaseClient,
  input: CreateGroupInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('tournament_groups')
    .insert([input])
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: (data as { id: string }).id }
}

export async function deleteGroup(supabase: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await supabase.from('tournament_groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}

export async function assignPlayerToGroup(
  supabase: SupabaseClient,
  groupId: string,
  playerId: string
): Promise<void> {
  const { error } = await supabase
    .from('tournament_group_players')
    .upsert([{ group_id: groupId, player_id: playerId }], { onConflict: 'group_id,player_id' })
  if (error) throw new Error(error.message)
}

export async function removePlayerFromGroup(
  supabase: SupabaseClient,
  groupId: string,
  playerId: string
): Promise<void> {
  const { error } = await supabase
    .from('tournament_group_players')
    .delete()
    .eq('group_id', groupId)
    .eq('player_id', playerId)
  if (error) throw new Error(error.message)
}
