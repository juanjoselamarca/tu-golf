// src/lib/data/tournaments/lifecycle.ts
//
// Cambios de estado del torneo: open (inscripciones), start (in_progress),
// close, cancel, revert-to-draft.

import type { SupabaseClient } from '@supabase/supabase-js'

async function setStatus(
  supabase: SupabaseClient,
  tournamentId: string,
  status: string
): Promise<void> {
  const { error } = await supabase
    .from('tournaments')
    .update({ status })
    .eq('id', tournamentId)
  if (error) throw new Error(error.message)
}

/**
 * Abre las inscripciones (draft → open). Es la única vía para que un torneo
 * llegue a 'open', el único estado que `joinFlow` acepta para auto-inscripción.
 * No tiene efectos colaterales: sólo cambia el estado, no materializa rondas.
 */
export function openTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'open')
}

/**
 * Vuelve a borrador (open → draft) sin tocar jugadores ya inscritos. Permite al
 * organizador cerrar inscripciones temporalmente; las filas de `players` quedan
 * intactas (a diferencia de cancelTournament que borra todo).
 */
export function revertToDraft(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'draft')
}

export function startTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'in_progress')
}

export function closeTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'closed')
}

export function cancelTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'cancelled')
}
