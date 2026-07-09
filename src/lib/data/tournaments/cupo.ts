/**
 * Cupo máximo del torneo (`tournaments.max_players`) — lectura + edición.
 *
 * Política PM 2026-07-09 ("bloquear + ampliar"): el organizador amplía el cupo
 * subiendo `max_players`. No se permite bajarlo por debajo de los ya inscritos
 * (aprobados) — eso dejaría el torneo "sobre-cupo" de forma inconsistente.
 * NULL = sin tope. Fuente única de la validación de edición del cupo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { tournamentCapacity } from './enrollPlayer'

export type UpdateMaxPlayersResult =
  | { ok: true; maxPlayers: number | null; approved: number }
  | {
      ok: false
      reason: 'invalid_value' | 'below_current' | 'not_found' | 'unknown'
      message: string
      approved?: number
    }

/**
 * Actualiza el cupo máximo del torneo. `newMax = null` quita el tope.
 * Rechaza valores no enteros / <1 y cualquier valor por debajo de los inscritos
 * activos actuales (no se puede "bajar el cupo por debajo de los ya inscritos").
 */
export async function updateMaxPlayers(
  admin: SupabaseClient,
  tournamentId: string,
  newMax: number | null
): Promise<UpdateMaxPlayersResult> {
  if (newMax !== null) {
    if (!Number.isInteger(newMax) || newMax < 1) {
      return {
        ok: false,
        reason: 'invalid_value',
        message: 'El cupo debe ser un número entero de 1 o más (o vacío para quitar el tope).',
      }
    }
  }

  // Cuántos inscritos activos hay hoy — no se puede bajar por debajo de esto.
  const cap = await tournamentCapacity(admin, tournamentId)
  if (newMax !== null && newMax < cap.approved) {
    return {
      ok: false,
      reason: 'below_current',
      message: `No puedes fijar el cupo en ${newMax}: ya hay ${cap.approved} jugadores inscritos. Retira jugadores o sube el cupo.`,
      approved: cap.approved,
    }
  }

  const { error } = await admin
    .from('tournaments')
    .update({ max_players: newMax })
    .eq('id', tournamentId)

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      message: `No se pudo actualizar el cupo: ${error.message}`,
    }
  }

  return { ok: true, maxPlayers: newMax, approved: cap.approved }
}
