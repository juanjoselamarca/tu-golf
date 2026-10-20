// src/lib/data/tournaments/historial-del-cierre-pasos.ts
//
// Pasos del workflow `historialDelCierre`. Cada uno se reintenta si lanza, así que debe
// poder repetirse sin duplicar nada. Fuera de un workflow son funciones comunes.

import { RetryableError } from 'workflow'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { guardarRondaDeTorneoEnHistorial, recalcularIndiceYNivel } from './historial-torneo'

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
 * Devuelve las cuentas cuyo índice hay que recalcular. Lo recalcula otro paso: el SDK guarda lo
 * que devuelve éste, así que un reintento del recálculo no las pierde aunque la fila ya se borró.
 */
export async function guardarRonda(roundId: string): Promise<string[]> {
  'use step'
  try {
    return await guardarRondaDeTorneoEnHistorial(createAdminClient(), roundId, { recalcularElIndice: false })
  } catch (e) {
    throw reintentarEnUnMinuto(e)
  }
}
guardarRonda.maxRetries = 10

/** Índice y nivel del jugador. */
export async function recalcularIndice(userId: string): Promise<void> {
  'use step'
  try {
    if (!(await recalcularIndiceYNivel(createAdminClient(), userId))) throw new Error('No se recalculó el índice del jugador')
  } catch (e) {
    throw reintentarEnUnMinuto(e)
  }
}
recalcularIndice.maxRetries = 10

/** Una caída de Supabase dura más que los reintentos inmediatos por defecto. */
function reintentarEnUnMinuto(e: unknown): RetryableError {
  return new RetryableError(mensajeDelError(e), { retryAfter: '1m' })
}

/** Supabase devuelve sus errores como objetos planos, no como `Error`, a veces con el mensaje vacío. */
function mensajeDelError(e: unknown): string {
  if (e instanceof Error) return e.message
  const { code, message, details, hint } = (e ?? {}) as Partial<Record<'code' | 'message' | 'details' | 'hint', string>>
  return [code, message || details || hint].filter(Boolean).join(': ') || JSON.stringify(e) || String(e)
}

/** Recibe el mensaje y no el error: un workflow sólo pasa a sus pasos valores serializables. */
export async function reportarFallaDelHistorial(mensaje: string, meta: Record<string, string>): Promise<void> {
  'use step'
  await captureError(new Error(mensaje), { context: 'torneo.historial-cierre', meta })
}
