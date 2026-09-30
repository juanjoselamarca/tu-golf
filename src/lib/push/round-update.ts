/**
 * src/lib/push/round-update.ts — empujar el estado ACTUAL de una ronda libre a
 * quienes la siguen. Fuente única del servidor: la usan /api/push/round-update
 * (scorer) y las rutas admin que escriben puntajes o cierran rondas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSpectatorNotification } from '@/golf/notifications/spectator'
import {
  deliverToSubscriptions,
  sendWebPush,
  TTL_ROUND_FINISHED_SECONDS,
  TTL_ROUND_UPDATE_SECONDS,
  type PushSender,
} from './deliver'
import { deleteStaleSubscriptions } from './subscriptions'
import { resolveWatcherSubscriptions, removeWatchersByIdentity, watchersToRemove } from './watchers'
import { loadRoundForPush, type RoundPushSnapshot } from './round-snapshot'

export type RoundUpdateResult =
  | { status: 'not_found' }
  | { status: 'sent'; sent: number; failed: number; transientFailed: number; cleaned: number; finished: boolean }

/**
 * El resultado final no llegó a todos por un fallo TRANSITORIO del servicio de
 * push: sus watchers siguen en pie y el cliente debe reintentar (force). La
 * ruta responde no-2xx con esto; un 200 dejaba al espectador sin resultado y
 * la fila de round_watchers viva para siempre (review #449 M1). Una
 * suscripción muerta (410/404) no cuenta: ya se borró y nadie la va a
 * alcanzar reintentando (review 5, I-2).
 */
export function needsRetry(result: RoundUpdateResult): boolean {
  return result.status === 'sent' && result.finished && result.transientFailed > 0
}

/** Payload que recibe public/sw.js (mismo contrato que el mensaje local del cliente). */
export function buildRoundUpdatePayload(snapshot: RoundPushSnapshot): { payload: string; finished: boolean } {
  const finished = snapshot.estado === 'finalizada'
  const notif = buildSpectatorNotification({
    courseName: snapshot.courseName,
    codigo: snapshot.codigo,
    players: snapshot.players,
    totalHoles: snapshot.holes,
    finished,
  })
  // El ícono/badge los pone el Service Worker: no se manda un path inexistente.
  return {
    finished,
    payload: JSON.stringify({
      title: notif.title,
      body: notif.body,
      tag: notif.tag,
      type: 'spectator',
      rondaCodigo: snapshot.codigo,
      finished,
      data: { url: notif.url, rondaCodigo: snapshot.codigo },
    }),
  }
}

export async function pushRoundUpdate(
  admin: SupabaseClient,
  codigo: string,
  send: PushSender = sendWebPush,
  snapshot?: RoundPushSnapshot | null,
): Promise<RoundUpdateResult> {
  const snap = snapshot ?? await loadRoundForPush(admin, codigo)
  if (!snap) return { status: 'not_found' }

  const subscriptions = await resolveWatcherSubscriptions(admin, codigo)
  const { payload, finished } = buildRoundUpdatePayload(snap)

  let sent = 0, failed = 0, transientFailed = 0, cleaned = 0
  if (subscriptions.length > 0) {
    const result = await deliverToSubscriptions(subscriptions, payload, send, {
      ttlSeconds: finished ? TTL_ROUND_FINISHED_SECONDS : TTL_ROUND_UPDATE_SECONDS,
      topic: codigo,
    })
    await deleteStaleSubscriptions(admin, result.staleEndpoints)
    sent = result.sent; failed = result.failed; transientFailed = result.transientFailed; cleaned = result.staleEndpoints.length
    // Se retiran los watchers sin destino (todas sus suscripciones muertas) y,
    // si la ronda terminó, los que RECIBIERON el resultado. Los de un fallo
    // transitorio quedan para el reintento (ver watchersToRemove).
    await removeWatchersByIdentity(admin, codigo, watchersToRemove(subscriptions, result, { finished }))
  }

  return { status: 'sent', sent, failed, transientFailed, cleaned, finished }
}
