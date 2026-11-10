/**
 * FUENTE ÚNICA de "las rondas que promedia el Índice Golfers+" leídas desde la base: las de
 * `indexWindow` (src/golf/core/index-window.ts), gemela del RPC `calcular_indice_golfers`
 * (diferencial, slope y CR, no excluida, gross posible; las 20 más recientes, mismo orden).
 *
 * La usan el CPI (`fetchRondasCPI`: /perfil, /api/cpi, /coach, import-confirm) y Mi Golf
 * (`.length` → barra "Calibración del índice"), así que lo que cuentan es lo que el RPC promedia.
 *
 * Las tarjetas FedeGolf no se filtran aparte: el RPC tampoco lo hace, y llegan con
 * `excluded_from_handicap = TRUE` (10-nov-2026: 0 de 32 sin excluir en prod).
 * Los filtros del query solo achican la respuesta; decide `indexWindow`. Sin `limit`: cortaría
 * antes del filtro del gross posible. Con el orden del RPC, si PostgREST corta en su máximo de
 * filas (1000) quedan las más recientes. `null` (y se reporta) si la lectura falla.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { indexWindow, INDEX_WINDOW_COLUMNS, type IndexWindowRound } from '@/golf/core/index-window'
import { captureError } from '@/lib/error-tracking'

export async function fetchRondasIndice(supabase: SupabaseClient, userId: string): Promise<IndexWindowRound[] | null> {
  const { data, error } = await supabase
    .from('historical_rounds')
    .select(INDEX_WINDOW_COLUMNS)
    .eq('user_id', userId)
    .not('diferencial', 'is', null)
    .not('slope_rating', 'is', null)
    .not('course_rating', 'is', null)
    .eq('excluded_from_handicap', false)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
  if (error) {
    void captureError(error, { context: 'historical-rounds.rondas-indice', level: 'warning', meta: { userId } })
    return null
  }
  return indexWindow((data ?? []) as unknown as IndexWindowRound[])
}
