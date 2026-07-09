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

// NOTA: la inscripción canónica (INSERT en `players` + `rounds` + validación de
// cupo/status) vive en `./enrollPlayer.ts` (fuente única usada por los 3 caminos:
// self-service, alta registrado del organizador, alta invitado). El antiguo
// `inscribePlayer` de acá insertaba una columna inexistente (`profile_id`) y no
// validaba cupo — era dead code que parecía la solución correcta. Eliminado.

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
