// src/lib/data/tournaments/ultima-ronda-cerrada.ts
//
// ¿Están cerradas todas las tarjetas de la última ronda del torneo? Habilita
// "Cerrar torneo" en el panel del organizador. Antes la consulta vivía en el
// hook `useTournamentLifecycle`. Corre con el client del navegador (RLS).

import type { SupabaseClient } from '@supabase/supabase-js'
import { esTarjetaCerrada } from '@/golf/tournament-rounds'

/**
 * true si hay tarjetas y todas las de la última `round_number` están cerradas
 * ('closed' u 'official', fuente única `esTarjetaCerrada`). Sin tarjetas o si la
 * consulta falla: false (el botón queda deshabilitado, nunca habilitado de más).
 */
export async function ultimaRondaCerrada(supabase: SupabaseClient, tournamentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, status, round_number')
    .eq('tournament_id', tournamentId)
  if (error || !data || data.length === 0) return false
  const rounds = data as Array<{ status: string; round_number: number | null }>
  const maxRound = Math.max(...rounds.map((r) => r.round_number || 1))
  const ultima = rounds.filter((r) => (r.round_number || 1) === maxRound)
  return ultima.length > 0 && ultima.every((r) => esTarjetaCerrada(r.status))
}
