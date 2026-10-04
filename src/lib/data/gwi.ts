// ─── Capa de datos — GWI (servidor) ─────────────────────────────────────────
// Historial y patrones del coach de los jugadores: los inputs PRIVADOS del GWI.
// Sólo lo usan `gwi-ronda-libre.ts` y `gwi-torneo.ts`, que calculan el GWI en el
// servidor y devuelven el resultado público (`GWIResponse`). Nunca se exponen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { agruparPorUsuario, type PatronGWIRow, type RondaHistoricaGWI } from '@/golf/stats/gwi-historial'

export interface DatosPrivadosGWI {
  historialPorUsuario: Map<string, RondaHistoricaGWI[]>
  patronesPorUsuario: Map<string, PatronGWIRow[]>
}

/**
 * Historial (más reciente primero) y patrones activos de varios usuarios en 2
 * queries batch, en vez de N+1. Sin usuarios no consulta nada.
 */
export async function fetchDatosPrivadosGWI(
  supabase: Pick<SupabaseClient, 'from'>,
  userIds: string[],
): Promise<DatosPrivadosGWI> {
  if (userIds.length === 0) return { historialPorUsuario: new Map(), patronesPorUsuario: new Map() }

  const [{ data: hist }, { data: pats }] = await Promise.all([
    supabase
      .from('historical_rounds')
      .select('user_id, total_gross, course_name, holes_played, scores')
      .in('user_id', userIds)
      .not('total_gross', 'is', null)
      .order('played_at', { ascending: false }),
    supabase
      .from('player_patterns')
      .select('user_id, pattern_type, confidence, metadata')
      .in('user_id', userIds)
      .eq('status', 'active'),
  ])

  return {
    historialPorUsuario: agruparPorUsuario((hist ?? []) as Array<RondaHistoricaGWI & { user_id: string }>),
    patronesPorUsuario: agruparPorUsuario((pats ?? []) as Array<PatronGWIRow & { user_id: string }>),
  }
}
