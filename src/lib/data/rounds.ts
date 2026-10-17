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
 * error (la ronda queda privada). Por eso se cuentan las filas: 0 filas NO es
 * éxito — el link que se iba a compartir abriría "Tarjeta no encontrada".
 * Idempotente.
 *
 * Nota de privacidad: la página `/tarjeta/[id]` NO trae las `notes` salvo para
 * el dueño (no viajan por el cable a terceros). PENDIENTE (follow-up del proyecto
 * compartir-unificado): `anon` todavía tiene SELECT a nivel TABLA en
 * `historical_rounds`, así que un endpoint dedicado de solo-lectura debe servir
 * solo campos seguros — el endurecimiento a nivel columna aún NO está aplicado.
 *
 * No lanza: un fallo se loguea y se devuelve `false`. El caller NO debe abrir el
 * sheet de compartir con `false` (el destinatario vería "Tarjeta no encontrada").
 * @returns `true` si la ronda quedó pública.
 */
export async function publishRound(supabase: SupabaseClient, id: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('historical_rounds')
      .update({ privacy: 'public' })
      .eq('id', id)
      .select('id')

    if (error || !data?.length) {
      await captureError(error ?? new Error('publicar ronda afectó 0 filas'), { context: 'publishRound', meta: { roundId: id } })
      return false
    }
    return true
  } catch (err) {
    await captureError(err, { context: 'publishRound', meta: { roundId: id } })
    return false
  }
}
