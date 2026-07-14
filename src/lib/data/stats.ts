// ─── Capa de datos para /perfil/stats ────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { parPlayedFromRound } from '@/golf/core/compare'
import { captureError } from '@/lib/error-tracking'

/**
 * Ronda histórica con lo que necesita la pantalla de estadísticas.
 * `par_played` se enriquece acá (derivado de par_per_hole + scores): vsPar()
 * de compare.ts lo usa con prioridad sobre par_total, dando métricas correctas
 * en pares mixtos (3/4/5) y rondas parciales.
 */
export interface StatsRound {
  id: string
  course_name: string
  tee_color: string | null
  played_at: string
  scores: number[] | null
  total_gross: number
  notes: string | null
  privacy: string
  created_at: string
  holes_played?: number | null
  par_per_hole?: Record<string, number> | null
  par_played?: number | null
}

const STATS_ROUND_COLS =
  'id, course_name, tee_color, played_at, scores, total_gross, notes, privacy, created_at, holes_played, par_per_hole'

/**
 * Todas las rondas históricas del usuario, ascendentes por fecha, enriquecidas
 * con par_played. El `.eq('user_id')` es explícito además de la RLS own_rounds
 * (defensa en profundidad — mismo resultado, intención legible).
 *
 * No lanza: si la query falla se loguea y la UI cae al empty state.
 */
export async function fetchStatsRounds(supabase: SupabaseClient, userId: string): Promise<StatsRound[]> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select(STATS_ROUND_COLS)
    .eq('user_id', userId)
    .order('played_at', { ascending: true })

  if (error) {
    await captureError(error, { context: 'fetchStatsRounds', meta: { userId } })
    return []
  }

  return ((data as StatsRound[]) ?? []).map((r) => ({
    ...r,
    par_played: parPlayedFromRound(r.scores, r.par_per_hole) ?? null,
  }))
}
