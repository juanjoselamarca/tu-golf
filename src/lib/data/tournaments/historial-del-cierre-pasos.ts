// src/lib/data/tournaments/historial-del-cierre-pasos.ts
//
// Pasos del workflow `historialDelCierre`. Cada uno se reintenta si lanza, así que debe
// poder repetirse sin duplicar nada. Fuera de un workflow son funciones comunes.

import { RetryableError } from 'workflow'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { guardarRondaDeTorneoEnHistorial } from './historial-torneo'

/** Las rondas que cerró el cierre más las cerradas sin finalizar que dejó un cierre que falló a mitad. */
export async function rondasPorGuardar(tournamentId: string, cerradas: string[]): Promise<string[]> {
  'use step'
  const { data, error } = await createAdminClient()
    .from('rounds')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'closed')
    .is('closed_at', null)
  if (error) throw new Error(mensajeDelError(error))
  return [...new Set([...cerradas, ...((data ?? []) as Array<{ id: string }>).map(r => r.id)])]
}

/**
 * Vuelve recién con el índice y el nivel del jugador recalculados. Reintenta cada minuto y no de
 * inmediato: una caída de Supabase dura más que los reintentos por defecto.
 */
export async function guardarRonda(roundId: string): Promise<void> {
  'use step'
  try {
    await guardarRondaDeTorneoEnHistorial(createAdminClient(), roundId, { esperarElIndice: true })
  } catch (e) {
    throw new RetryableError(mensajeDelError(e), { retryAfter: '1m' })
  }
}
guardarRonda.maxRetries = 10

/** Supabase devuelve sus errores como objetos planos, no como `Error`. */
function mensajeDelError(e: unknown): string {
  if (e instanceof Error) return e.message
  const { code, message } = (e ?? {}) as { code?: string; message?: string }
  return message ? [code, message].filter(Boolean).join(': ') : String(e)
}

/** Recibe el mensaje y no el error: un workflow sólo pasa a sus pasos valores serializables. */
export async function reportarFallaDelHistorial(mensaje: string, meta: Record<string, string>): Promise<void> {
  'use step'
  await captureError(new Error(mensaje), { context: 'torneo.historial-cierre', meta })
}
