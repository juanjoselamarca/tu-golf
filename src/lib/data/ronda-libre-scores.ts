// ─── Capa de datos — escritura de puntajes / cierre de ronda libre ───────────
//
// ÚNICO punto por el que el cliente guarda puntajes (individuales o de equipo)
// o finaliza una ronda libre. Lo usan el scorer individual (useScoreSave,
// auto-sync, flush al desmontar), el scorer de grupo/admin (score-grupo,
// incluidos scramble/foursome) y useFinalizeRonda.
//
// Por qué existe: cada camino de escritura tenía su propio `supabase.rpc(...)`
// y sólo UNO avisaba a quienes siguen la ronda (push). La ronda 4YDC3G del
// 25-sep era admin_mode → score-grupo → nunca llegó un push (review PR #449,
// C1). Acá el aviso sale junto con el guardado, para todos los caminos. Un
// canario (src/__tests__/canary-ronda-libre-write-paths.test.ts) falla si
// alguien vuelve a llamar las RPC o a cerrar la ronda por fuera.

import type { PostgrestError } from '@supabase/supabase-js'
import { triggerRoundUpdatePush } from '@/lib/round-notifications'
import { RONDA_ERRCODE } from '@/lib/data/ronda-libre-cierre'

type RpcResult = PromiseLike<{ data?: unknown; error: PostgrestError | null }>

/**
 * Lo mínimo que necesitamos del cliente (browser o server, con o sin RLS).
 * Sólo RPCs: sin `from(...)` a propósito — el cliente no escribe tablas de
 * ronda libre directo (P0 RLS 29-sep-2026; los RPCs deciden quién puede).
 */
export interface RondaLibreWriteClient {
  rpc: (
    fn: 'upsert_ronda_libre_scores' | 'upsert_ronda_equipos_scores' | 'finalizar_ronda_libre',
    args: Record<string, unknown>,
  ) => RpcResult
}

function toJsonbDelta(delta: Record<string | number, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(delta)) out[String(k)] = v  // claves string para JSONB
  return out
}

export interface SaveScoresInput {
  codigo: string
  jugadorId: string
  /** hoyo → golpes. Se mergea server-side (`scores || delta`), nunca reemplaza. */
  delta: Record<string | number, number>
}

/**
 * Guarda el delta de puntajes de un jugador (merge atómico en la RPC, audit
 * 2026-05-17 P0 #1) y, si salió bien, avisa a quienes siguen la ronda. El
 * jugadorId viaja con el aviso: un invitado sin cuenta prueba con él que anota
 * en la ronda. Devuelve el error de la RPC tal cual (P0002 = ronda finalizada).
 */
export async function saveRondaLibreScores(
  supabase: RondaLibreWriteClient,
  input: SaveScoresInput,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('upsert_ronda_libre_scores', {
    p_jugador_id: input.jugadorId,
    p_codigo: input.codigo,
    p_delta: toJsonbDelta(input.delta),
  })
  if (!error) triggerRoundUpdatePush(input.codigo, { jugadorId: input.jugadorId })
  return { error: error ?? null }
}

export interface SaveEquipoScoresInput {
  codigo: string
  equipoId: string
  delta: Record<string | number, number>
  /** Un jugador del equipo: con él un invitado sin cuenta prueba que anota en la ronda. */
  jugadorId?: string
}

/** Scramble / foursome: el score compartido vive en ronda_equipos. Mismo aviso. */
export async function saveRondaEquiposScores(
  supabase: RondaLibreWriteClient,
  input: SaveEquipoScoresInput,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.rpc('upsert_ronda_equipos_scores', {
    p_equipo_id: input.equipoId,
    p_codigo: input.codigo,
    p_delta: toJsonbDelta(input.delta),
  })
  if (!error) triggerRoundUpdatePush(input.codigo, { jugadorId: input.jugadorId })
  return { error: error ?? null }
}

/**
 * Cierra la ronda por el RPC `finalizar_ronda_libre` (única puerta: valida
 * quién puede y solo cierra si sigue en_curso) y, si ESTA llamada la cerró,
 * empuja el "Resultado final" a quienes la siguen. Si otro dispositivo ganó la
 * carrera (`finalizada: false`), ese ya avisó: no se duplica el push.
 * Error de transporte (la respuesta se perdió: no sabemos si cerró) → se
 * empuja igual: el servidor lee el estado real de la ronda y sólo manda el
 * final a quien todavía no lo recibió. Un rechazo del RPC (errcode propio)
 * no empuja.
 * `jugadorId`: quien finaliza sin cuenta (invitado) prueba con él que
 * participa — sin eso el servidor responde 401 y el aviso nunca sale.
 */
export async function finalizarRondaLibre(
  supabase: RondaLibreWriteClient,
  codigo: string,
  opts: { jugadorId?: string } = {},
): Promise<{ finalizada: boolean; error: PostgrestError | null }> {
  const { data, error } = await supabase.rpc('finalizar_ronda_libre', { p_codigo: codigo })
  const rechazado = !!error && (Object.values(RONDA_ERRCODE) as string[]).includes(error.code)
  const finalizada = !error && data === true
  if (finalizada || (error && !rechazado)) triggerRoundUpdatePush(codigo, { force: true, jugadorId: opts.jugadorId })
  return { finalizada, error: error ?? null }
}
