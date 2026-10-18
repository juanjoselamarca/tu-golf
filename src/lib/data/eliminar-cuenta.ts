// ─── Eliminar la cuenta de un usuario ───────────────────────────────────────
// Una sola llamada a la RPC `eliminar_cuenta` (migración 20261018060000), que borra todo en UNA
// transacción: o se va la cuenta completa, o no se toca nada. Antes el route borraba tabla por
// tabla ignorando errores y, para cualquier jugador de un torneo con grupos, dejaba la cuenta viva
// con el historial ya borrado.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SOPORTE_EMAIL } from '@/lib/constants'

/** Motivos por los que borrar la cuenta destruiría datos de otras personas. */
export type BloqueoDeEliminacion =
  | 'organiza_torneos_con_otros'
  | 'creo_rondas_con_otros'
  | 'firmo_correcciones_de_score'

export type ResultadoEliminarCuenta =
  | { estado: 'eliminada' }
  | { estado: 'bloqueada'; bloqueos: BloqueoDeEliminacion[] }
  | { estado: 'error'; error: unknown }

const BLOQUEOS_CONOCIDOS: readonly BloqueoDeEliminacion[] = [
  'organiza_torneos_con_otros',
  'creo_rondas_con_otros',
  'firmo_correcciones_de_score',
]

const QUE_TIENE: Record<BloqueoDeEliminacion, string> = {
  organiza_torneos_con_otros: 'torneos que organizas con otros jugadores',
  creo_rondas_con_otros: 'rondas que creaste y que jugaron otros usuarios',
  // score_audit_log.changed_by → auth.users es NO ACTION: el historial de correcciones de un torneo
  // no se puede reescribir sin perder quién corrigió qué.
  firmo_correcciones_de_score: 'correcciones de score que hiciste en torneos',
}

/** Copy para el usuario cuando la cuenta no se puede borrar sin borrar datos ajenos. */
export function mensajeDeBloqueo(bloqueos: BloqueoDeEliminacion[]): string {
  const cosas = bloqueos.map(b => QUE_TIENE[b])
  const lista = cosas.length > 1 ? `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}` : cosas[0]
  return `Tu cuenta tiene ${lista}. Eliminarla afectaría las tarjetas de otros jugadores, así que no borramos nada. Escríbenos a ${SOPORTE_EMAIL} y lo resolvemos contigo.`
}

/**
 * Borra la cuenta `userId`. Recibe un cliente con service role: la RPC no la puede llamar un usuario.
 * Quien llama tiene que haber validado que `userId` es el de la sesión.
 */
export async function eliminarCuenta(admin: SupabaseClient, userId: string): Promise<ResultadoEliminarCuenta> {
  const { data, error } = await admin.rpc('eliminar_cuenta', { p_user_id: userId })
  if (error) return { estado: 'error', error }

  const res = data as { ok?: unknown; bloqueos?: unknown } | null
  if (res?.ok === true) return { estado: 'eliminada' }

  const bloqueos = Array.isArray(res?.bloqueos)
    ? res.bloqueos.filter((b): b is BloqueoDeEliminacion => BLOQUEOS_CONOCIDOS.includes(b as BloqueoDeEliminacion))
    : []
  // Una respuesta que no se entiende no es "bloqueada": no se puede explicar al usuario por qué.
  if (res?.ok === false && bloqueos.length > 0) return { estado: 'bloqueada', bloqueos }
  return { estado: 'error', error: new Error(`eliminar_cuenta: respuesta inesperada ${JSON.stringify(data)}`) }
}
