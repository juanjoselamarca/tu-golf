// src/lib/data/tournaments/groups.ts
//
// Capa de datos ÚNICA para tournament_groups + tournament_group_players
// (armado de grupos/parejas del torneo). Antes el hook `useGroups` hacía
// `supabase.from()` inline con su PROPIO SELECT, divergente del que vivía acá
// (que unía nombres en DB y no traía el id de la membresía). Unificado: esta
// capa es la fuente única del SELECT y de las mutaciones; el hook sólo orquesta
// estado + mapea a la vista.
//
// Corre con el client del navegador. RLS ya gobierna el acceso: policy
// "Organizer manage" limita las escrituras al organizador; "Public read"
// permite el listado.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * SELECT único de grupos. Incluye el id de la membresía
 * (`tournament_group_players.id`) porque la UI lo usa como key de lista. Los
 * nombres de jugador NO se unen en DB: el hook los resuelve del prop `players`
 * ya cargado (evita un join extra de profiles).
 */
export const GROUPS_SELECT =
  'id, name, tee_time, sort_order, ronda_libre_id, tournament_group_players(id, player_id)'

export interface GroupMembershipRow {
  id: string
  player_id: string
}

export interface GroupRow {
  id: string
  name: string
  tee_time: string | null
  sort_order: number
  ronda_libre_id: string | null
  tournament_group_players?: GroupMembershipRow[]
}

/** Lista los grupos del torneo ordenados por sort_order. */
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
  tournamentId: string
  name: string
  teeTime: string | null
  sortOrder: number
}

/** Crea un grupo. */
export async function createGroup(
  supabase: SupabaseClient,
  input: CreateGroupInput
): Promise<void> {
  const { error } = await supabase.from('tournament_groups').insert({
    tournament_id: input.tournamentId,
    name: input.name,
    tee_time: input.teeTime,
    sort_order: input.sortOrder,
  })
  if (error) throw new Error(error.message)
}

/** Borra un grupo por id (cascade elimina sus membresías). */
export async function deleteGroup(supabase: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await supabase.from('tournament_groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}

/** Fija el horario de salida (tee time) de un grupo. */
export async function setGroupTeeTime(
  supabase: SupabaseClient,
  groupId: string,
  teeTime: string | null
): Promise<void> {
  const { error } = await supabase
    .from('tournament_groups')
    .update({ tee_time: teeTime })
    .eq('id', groupId)
  if (error) throw new Error(error.message)
}

/**
 * Reasigna un jugador a un grupo: lo saca de CUALQUIER grupo previo (regla
 * "1 jugador ≤ 1 grupo") y, si `groupId` no es null, lo inserta en el elegido.
 * `groupId === null` = sólo quitarlo. No atómico (delete-then-insert), aceptable
 * para el armado por un único organizador; un duplicado (doble click) no se
 * trata como error porque el jugador ya quedó donde se pidió.
 */
export async function assignPlayerToGroup(
  supabase: SupabaseClient,
  playerId: string,
  groupId: string | null
): Promise<void> {
  const { error: delErr } = await supabase
    .from('tournament_group_players')
    .delete()
    .eq('player_id', playerId)
  if (delErr) throw new Error(delErr.message)

  if (!groupId) return

  const { error: insErr } = await supabase
    .from('tournament_group_players')
    .insert({ group_id: groupId, player_id: playerId })
  if (insErr && !insErr.message.toLowerCase().includes('duplicate')) {
    throw new Error(insErr.message)
  }
}
