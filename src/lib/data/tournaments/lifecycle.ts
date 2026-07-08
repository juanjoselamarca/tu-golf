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

/**
 * Cierra el torneo y lo CONGELA: además de marcar el estado 'closed', finaliza
 * todas sus rondas para que no se puedan editar scores tras el cierre ("los
 * resultados serán definitivos"). Sin esto el board cambiaba después del cierre:
 *  - Path individual: el scoring mira `rounds.status` (`upsert_score` bloquea en
 *    closed/official) → cerramos las `rounds` del torneo.
 *  - Path de EQUIPOS: el scoring va por la RPC `upsert_ronda_equipos_scores`, que
 *    solo mira `rondas_libres.estado` → finalizamos las `rondas_libres`
 *    materializadas por grupo (linkadas vía `tournament_groups.ronda_libre_id`).
 *
 * Orden defensivo: se congela el scoring (rounds + rondas_libres) ANTES de marcar
 * el torneo 'closed'. Si algo falla, el torneo NO queda 'closed' con rondas
 * abiertas; el organizador reintenta (idempotente) y el board nunca cambia tras
 * un cierre "exitoso".
 */
export async function closeTournament(supabase: SupabaseClient, id: string): Promise<void> {
  // 1. Cerrar las rondas individuales del torneo.
  const { error: rErr } = await supabase
    .from('rounds')
    .update({ status: 'closed' })
    .eq('tournament_id', id)
    .neq('status', 'closed')
  if (rErr) throw new Error(rErr.message)

  // 2. Finalizar las rondas_libres materializadas por grupo (scoring de equipo).
  const { data: groups, error: gErr } = await supabase
    .from('tournament_groups')
    .select('ronda_libre_id')
    .eq('tournament_id', id)
    .not('ronda_libre_id', 'is', null)
  if (gErr) throw new Error(gErr.message)
  const rondaIds = (groups ?? [])
    .map((g) => (g as { ronda_libre_id: string | null }).ronda_libre_id)
    .filter((rid): rid is string => rid != null)
  if (rondaIds.length > 0) {
    const { error: rlErr } = await supabase
      .from('rondas_libres')
      .update({ estado: 'finalizada' })
      .in('id', rondaIds)
    if (rlErr) throw new Error(rlErr.message)
  }

  // 3. Marcar el torneo cerrado (último — ver orden defensivo arriba).
  await setStatus(supabase, id, 'closed')
}

export function cancelTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'cancelled')
}
