// src/lib/data/tournaments/lifecycle.ts
//
// Cambios de estado del torneo: start (in_progress), close, cancel.

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

export function startTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'in_progress')
}

export function closeTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'closed')
}

export function cancelTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'cancelled')
}
