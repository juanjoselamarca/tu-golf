// src/lib/data/ronda-libre-cierre.ts
//
// Descartar una ronda libre y los errcodes de los RPCs de ronda libre.
// Única puerta: el RPC `descartar_ronda_libre` (migración 20260929b), que
// decide quién puede hacerlo. Finalizar vive en `ronda-libre-scores.ts`
// (`finalizarRondaLibre`), junto al push a los seguidores.
// Nunca UPDATE/DELETE directo desde el cliente: con RLS, una fila que no te
// pertenece devuelve 0 filas SIN error, y la UI decía "listo" sin que nada
// pasara (o, antes del 29-sep-2026, pasaba por el hueco de las policies
// permisivas).

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

/** Errcodes de los RPCs de ronda libre (ver migración 20260929b). */
export const RONDA_ERRCODE = {
  NOT_FOUND: 'P0001',
  FINALIZED: 'P0002',
  FORBIDDEN: 'P0003',
  INVALID_DELTA: 'P0004',
} as const

/** Errcode de Postgres de un parámetro inválido (p. ej. un punto especial que no está en las reglas de la Timba). */
const PARAMETRO_INVALIDO = '22023'

/**
 * Rechazos DEFINITIVOS de las RPC de escritura de ronda libre (golpes, puntos especiales, retiros): reintentar
 * no sirve, el cambio sale de pendientes. Fuente única para el scorer y la cola de marcas.
 *
 * Todo lo demás se reintenta, en particular:
 *  - sin red: postgrest-js NO lanza, devuelve `{ code: '', status: 0 }` (y `SIN_RESPUESTA` si venció el plazo);
 *  - 5xx / caída del servidor;
 *  - P0003 (FORBIDDEN): lo típico es una sesión vencida, y al volver a entrar el mismo envío pasa.
 */
const RECHAZOS_DEFINITIVOS: readonly string[] = [
  RONDA_ERRCODE.NOT_FOUND,
  RONDA_ERRCODE.FINALIZED,
  RONDA_ERRCODE.INVALID_DELTA,
  PARAMETRO_INVALIDO,
]

export function esRechazoDefinitivo(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && RECHAZOS_DEFINITIVOS.includes(error.code)
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

/** Mensaje para el usuario según el error del RPC de descarte. */
export function mensajeErrorDescartar(error: Pick<PostgrestError, 'code' | 'details' | 'message'>): string {
  if (error.code === RONDA_ERRCODE.FORBIDDEN) {
    if (error.details === 'ronda de torneo') return 'Las rondas de un torneo no se pueden descartar.'
    if (error.details === 'ronda con datos asociados') return 'Esta ronda tiene datos asociados y no se puede descartar.'
    return 'Solo quien creó la ronda puede descartarla.'
  }
  if (error.code === RONDA_ERRCODE.NOT_FOUND) return 'Esta ronda ya no existe.'
  return 'No se pudo descartar la ronda. Intenta de nuevo.'
}

/**
 * Borra la ronda con sus jugadores y equipos, en una sola transacción.
 * Solo el creador; nunca una ronda de torneo.
 */
export async function descartarRondaLibre(
  supabase: RpcClient,
  codigo: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('descartar_ronda_libre', { p_codigo: codigo })
  if (!error) return { error: null }
  return { error: mensajeErrorDescartar(error) }
}
