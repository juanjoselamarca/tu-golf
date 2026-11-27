/**
 * Cupo máximo del torneo (`tournaments.max_players`) — lectura + edición.
 *
 * Política PM 2026-07-09 ("bloquear + ampliar"): el organizador amplía el cupo
 * subiendo `max_players`. No se permite bajarlo por debajo de los ya inscritos
 * (aprobados) — eso dejaría el torneo "sobre-cupo" de forma inconsistente.
 * NULL = sin tope. Fuente única de la validación de edición del cupo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { tournamentCapacity, type CapacityInfo } from './enrollPlayer'

/** Aviso al organizador cuando la base falla; el detalle técnico va a captureError en la ruta. */
const MENSAJE_CUPO_FALLIDO = 'No se pudo actualizar el cupo. Intenta nuevamente.'

export type UpdateMaxPlayersResult =
  | { ok: true; maxPlayers: number | null; approved: number }
  | {
      ok: false
      reason: 'invalid_value' | 'below_current' | 'not_found' | 'unknown'
      message: string
      approved?: number
      /** Solo para captureError (reason 'unknown'); nunca se muestra. */
      detalle?: string
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
  // Si no se pudo contar, NO se toca el cupo (antes contaba 0 y la guardia de abajo se apagaba).
  let cap: CapacityInfo
  try {
    cap = await tournamentCapacity(admin, tournamentId)
  } catch (e) {
    return { ok: false, reason: 'unknown', message: MENSAJE_CUPO_FALLIDO, detalle: textoDeError(e) }
  }
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
      message: MENSAJE_CUPO_FALLIDO,
      detalle: error.message,
    }
  }

  return { ok: true, maxPlayers: newMax, approved: cap.approved }
}

function textoDeError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
