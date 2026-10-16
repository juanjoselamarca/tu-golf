// src/lib/data/tournaments/players.ts
//
// Capa de datos para la tabla `players` (inscripciones a torneos).
// Centraliza queries que antes vivían directo en JugadoresPanel.tsx.
//
// Bug #6 inbox 25-may: agrega setPlayerTeeId para el modo manual.
//
// `categories.default_tee_color` existe desde la migración 20260925; hasta
// entonces este SELECT devolvía 42703 en prod y `listPlayers` fallaba.

import type { SupabaseClient } from '@supabase/supabase-js'

const PLAYERS_SELECT = `
  id, tournament_id, user_id, category_id, handicap_at_registration, status, tee_id, genero,
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
  /** `players.genero` ('M'|'F'), congelado al inscribirse. */
  genero: string | null
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
/** La inscripción del visor en el torneo (o null si no está inscrito). Sesión del visor: la RLS decide qué ve. */
export async function fetchInscripcionDelVisor(
  supabase: SupabaseClient,
  tournamentId: string,
  userId: string,
): Promise<{ id: string; status: string | null } | null> {
  const { data } = await supabase
    .from('players')
    .select('id, status')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { id: string; status: string | null } | null) ?? null
}

/** Lo mínimo de un grupo del torneo para saber dónde anota cada jugador. */
export interface GrupoParaScorer {
  ronda_libre_id: string | null
  tournament_group_players?: Array<{ player_id: string }> | null
}

export type DestinoDelScorer = { tipo: 'torneo' } | { tipo: 'ronda'; rondaId: string } | null

/**
 * Dónde anota el jugador su tarjeta: tiene que ser la misma fuente que lee el leaderboard
 * (`/torneo/[slug]`). Con grupos de ronda libre el leaderboard lee esas rondas, así que el
 * jugador anota en la de su grupo; sin ninguna, el camino legacy (`/torneo/[slug]/score`).
 * Si el torneo usa rondas de grupo y el suyo no tiene, no hay scorer cuyo score se vea → null.
 */
export function destinoDelScorer(playerId: string, grupos: GrupoParaScorer[]): DestinoDelScorer {
  if (!grupos.some(g => g.ronda_libre_id != null)) return { tipo: 'torneo' }
  const suyo = grupos.find(g => (g.tournament_group_players ?? []).some(gp => gp.player_id === playerId))
  return suyo?.ronda_libre_id ? { tipo: 'ronda', rondaId: suyo.ronda_libre_id } : null
}

/**
 * Código (el de la URL del scorer) de una ronda libre en la que todavía se anota. Una ronda
 * finalizada o demo rebota del scorer a la vista de solo lectura → null.
 */
export async function fetchCodigoSiSeAnota(supabase: SupabaseClient, rondaId: string): Promise<string | null> {
  const { data } = await supabase.from('rondas_libres').select('codigo, estado, es_demo').eq('id', rondaId).maybeSingle()
  const r = data as { codigo: string | null; estado: string | null; es_demo: boolean | null } | null
  if (!r?.codigo || r.estado === 'finalizada' || r.es_demo) return null
  return r.codigo
}

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
