// ─── Escritura de un hoyo de torneo (hole_scores) — capa de datos ────────────
//
// Único punto por el que /api/game (upsert_score) escribe un hoyo. Con orden
// (`seq` + `dispositivo` del scorer, fuente `@/lib/red/orden-guardado`) pasa por
// la función `guardar_hole_score`, que descarta un guardado más viejo del mismo
// dispositivo y hoyo que el que ya aplicó (migración 20261121100000). Residual
// de #754: el jugador anota 5, corrige a 4, y el POST del 5 llega después.
//
// Sin orden (cliente viejo en caché) o sin la función (el código llega a prod
// antes de que se apruebe la migración) se hace el upsert de siempre: el golpe
// se guarda igual, sólo que sin orden. Nunca se pierde un guardado por esto.

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import { isUuid } from '@/lib/uuid'

export interface OrdenGuardado {
  seq: number
  dispositivo: string
}

export type ResultadoHoleScore =
  | { ok: true; id: string | null; aplicado: boolean }
  | { ok: false; error: PostgrestError }

/** Lee `seq`/`dispositivo` del body. Uno malformado se ignora: se guarda sin orden antes que no guardar. */
export function ordenDelBody(body: Record<string, unknown>): OrdenGuardado | null {
  const { seq, dispositivo } = body
  if (!Number.isSafeInteger(seq) || (seq as number) < 1 || !isUuid(dispositivo)) return null
  return { seq: seq as number, dispositivo: dispositivo as string }
}

/**
 * La función todavía no existe en esta base: PostgREST responde PGRST202 (no
 * está en su caché del esquema) y Postgres 42883 (undefined_function).
 */
function faltaLaFuncion(error: PostgrestError): boolean {
  return error.code === 'PGRST202' || error.code === '42883'
}

/**
 * Upsert de la fila por (round_id, hole_number). `fila` sólo trae las columnas
 * a escribir: una ausente queda como estaba (lo mismo en los dos caminos).
 */
export async function guardarHoleScore(
  svc: SupabaseClient,
  fila: Record<string, unknown>,
  orden: OrdenGuardado | null,
): Promise<ResultadoHoleScore> {
  if (orden) {
    const { data, error } = await svc.rpc('guardar_hole_score', {
      p_fila: fila,
      p_seq: orden.seq,
      p_dispositivo: orden.dispositivo,
    })
    if (!error) {
      const r = data as { aplicado?: boolean; id?: string | null } | null
      return { ok: true, id: r?.id ?? null, aplicado: r?.aplicado !== false }
    }
    if (!faltaLaFuncion(error)) return { ok: false, error }
  }

  const { data, error } = await svc
    .from('hole_scores')
    .upsert(fila, { onConflict: 'round_id,hole_number' })
    .select('id')
    .single()
  if (error) return { ok: false, error }
  return { ok: true, id: (data as { id: string } | null)?.id ?? null, aplicado: true }
}
