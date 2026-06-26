// ─── Capa de datos para rondas históricas ───────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'

/**
 * Marca una ronda histórica como `public` para que su tarjeta `/tarjeta/[id]`
 * sea visible al compartir el link (modelo Strava: compartir = publicar).
 *
 * Fuente ÚNICA: todo punto de "Compartir" de una ronda histórica llama acá, así
 * la decisión de publicar vive en un solo lugar (un concepto, una fuente).
 *
 * Seguridad: la RLS `own_rounds` (auth.uid() = user_id) garantiza que SOLO el
 * dueño puede publicar; si lo llama otro usuario, el UPDATE afecta 0 filas sin
 * error (la ronda queda privada). Idempotente. Las `notes` no se exponen a
 * terceros (REVOKE SELECT(notes) a `anon` — migración 2026-06-26).
 *
 * No lanza: un fallo de publicación se loguea pero no rompe el flujo de compartir.
 * @returns `true` si el update no dio error.
 */
export async function publishRound(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await supabase
    .from('historical_rounds')
    .update({ privacy: 'public' })
    .eq('id', id)

  if (error) {
    await captureError(error, { context: 'publishRound', meta: { roundId: id } })
    return false
  }
  return true
}
