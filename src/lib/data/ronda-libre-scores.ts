// ─── Capa de datos — escritura de puntajes / cierre de ronda libre ───────────
//
// ÚNICO punto por el que el cliente guarda puntajes o finaliza una ronda libre.
// Lo usan el scorer individual (useScoreSave, auto-sync, flush al desmontar),
// el scorer de grupo/admin (score-grupo) y useFinalizeRonda.
//
// Por qué existe: cada camino de escritura tenía su propio `supabase.rpc(...)`
// y sólo UNO avisaba a quienes siguen la ronda (push). La ronda 4YDC3G del
// 25-sep era admin_mode → score-grupo → nunca llegó un push (review PR #449,
// C1). Acá el aviso sale junto con el guardado, para todos los caminos. Un
// canario (src/__tests__/canary-ronda-libre-write-paths.test.ts) falla si
// alguien vuelve a llamar la RPC o a cerrar la ronda por fuera.

import type { PostgrestError } from '@supabase/supabase-js'
import { triggerRoundUpdatePush } from '@/lib/round-notifications'

/** Lo mínimo que necesitamos del cliente (browser o server, con o sin RLS). */
export interface RondaLibreWriteClient {
  rpc: (fn: 'upsert_ronda_libre_scores', args: { p_jugador_id: string; p_codigo: string; p_delta: Record<string, number> }) => PromiseLike<{ error: PostgrestError | null }>
  from: (table: 'rondas_libres') => {
    update: (values: { estado: 'finalizada' }) => {
      eq: (col: string, val: string) => PromiseLike<{ error: PostgrestError | null }> & {
        eq: (col: string, val: string) => PromiseLike<{ error: PostgrestError | null }>
      }
    }
  }
}

export interface SaveScoresInput {
  codigo: string
  jugadorId: string
  /** hoyo → golpes. Se mergea server-side (`scores || delta`), nunca reemplaza. */
  delta: Record<string | number, number>
}

/**
 * Guarda el delta de puntajes de un jugador (merge atómico en la RPC, audit
 * 2026-05-17 P0 #1) y, si salió bien, avisa a quienes siguen la ronda.
 * Devuelve el error de la RPC tal cual (P0002 = la ronda ya fue finalizada).
 */
export async function saveRondaLibreScores(
  supabase: RondaLibreWriteClient,
  input: SaveScoresInput,
): Promise<{ error: PostgrestError | null }> {
  const delta: Record<string, number> = {}
  for (const [k, v] of Object.entries(input.delta)) delta[String(k)] = v  // claves string para JSONB
  const { error } = await supabase.rpc('upsert_ronda_libre_scores', {
    p_jugador_id: input.jugadorId,
    p_codigo: input.codigo,
    p_delta: delta,
  })
  if (!error) triggerRoundUpdatePush(input.codigo)
  return { error: error ?? null }
}

/**
 * Marca la ronda como finalizada y empuja el "Resultado final" a quienes la
 * siguen. `soloSiEnCurso` evita la carrera entre dos dispositivos que
 * finalizan a la vez (update condicional).
 */
export async function finalizarRondaLibre(
  supabase: RondaLibreWriteClient,
  codigo: string,
  opts: { soloSiEnCurso?: boolean } = {},
): Promise<{ error: PostgrestError | null }> {
  const q = supabase.from('rondas_libres').update({ estado: 'finalizada' }).eq('codigo', codigo)
  const { error } = await (opts.soloSiEnCurso ? q.eq('estado', 'en_curso') : q)
  if (!error) triggerRoundUpdatePush(codigo, { force: true })
  return { error: error ?? null }
}
