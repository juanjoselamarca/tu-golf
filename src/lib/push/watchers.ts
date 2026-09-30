/**
 * src/lib/push/watchers.ts — acceso a `round_watchers` (service role).
 *
 * Un watcher es (identidad, ronda). Identidad:
 *  - usuario  → user_id            → se empuja a TODOS los dispositivos del usuario
 *  - anónimo  → push_subscription_id → se empuja a ESE dispositivo
 *
 * Migración 20260929_round_watchers_anon.sql.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeliveryResult, PushSubscriptionRow } from './deliver'
import { dedupeByEndpoint } from './deliver'

export type WatcherIdentity =
  | { kind: 'user'; userId: string }
  | { kind: 'device'; subscriptionId: string }

/** Suscripción de un seguidor con su identidad: a quién pertenece cada endpoint. */
export interface WatcherSubscriptionRow extends PushSubscriptionRow {
  id: string
  user_id: string | null
}

/** Identidades (por columna) de watchers a retirar de una ronda. */
export interface WatcherRemoval {
  subscriptionIds: string[]
  userIds: string[]
}

/**
 * Tope de seguidores por ronda: acota el fan-out de cada push (y con él el
 * costo de un abuso). Una ronda libre real tiene decenas de seguidores, no
 * cientos.
 */
export const MAX_WATCHERS_PER_ROUND = 200

export class WatcherLimitError extends Error {
  constructor(codigo: string) { super(`La ronda ${codigo} alcanzó el máximo de seguidores`) }
}

/** Columna y valor que identifican al watcher en la tabla. */
function identityColumn(identity: WatcherIdentity): [column: string, value: string] {
  return identity.kind === 'user'
    ? ['user_id', identity.userId]
    : ['push_subscription_id', identity.subscriptionId]
}

export async function addWatcher(admin: SupabaseClient, codigo: string, identity: WatcherIdentity): Promise<void> {
  const [col, val] = identityColumn(identity)

  // Re-seguir no cuenta contra el tope.
  const { data: already } = await admin
    .from('round_watchers')
    .select('id')
    .eq('ronda_codigo', codigo)
    .eq(col, val)
    .maybeSingle()

  if (!already) {
    const { count } = await admin
      .from('round_watchers')
      .select('id', { count: 'exact', head: true })
      .eq('ronda_codigo', codigo)
    if ((count ?? 0) >= MAX_WATCHERS_PER_ROUND) throw new WatcherLimitError(codigo)
  }

  const { error } = identity.kind === 'user'
    ? await admin.from('round_watchers')
        .upsert({ user_id: identity.userId, ronda_codigo: codigo }, { onConflict: 'user_id,ronda_codigo' })
    : await admin.from('round_watchers')
        .upsert({ push_subscription_id: identity.subscriptionId, ronda_codigo: codigo }, { onConflict: 'push_subscription_id,ronda_codigo' })
  if (error) throw new Error(`round_watchers upsert: ${error.message}`)
}

export async function removeWatcher(admin: SupabaseClient, codigo: string, identity: WatcherIdentity): Promise<void> {
  const [col, val] = identityColumn(identity)
  const { error } = await admin.from('round_watchers').delete().eq('ronda_codigo', codigo).eq(col, val)
  if (error) throw new Error(`round_watchers delete: ${error.message}`)
}

/** La ronda terminó: no queda nada que empujar. (Cierres administrativos sin entrega.) */
export async function removeAllWatchers(admin: SupabaseClient, codigo: string): Promise<void> {
  await admin.from('round_watchers').delete().eq('ronda_codigo', codigo)
}

/**
 * Qué watchers de la ronda se retiran después de un envío. Decisión pura sobre
 * las suscripciones resueltas (con identidad) y el resultado de la entrega:
 *
 *  - Siempre: un usuario cuyas suscripciones están TODAS muertas (410/404) no
 *    puede recibir nada más — su watcher quedaba huérfano para siempre (review
 *    #449 M1: la fila de push_subscriptions ya no existe cuando termina la
 *    ronda, así que nunca aparecía entre los "alcanzados"). Los watchers por
 *    dispositivo caen en cascada al borrar la suscripción.
 *  - Ronda terminada: además se retira a quien RECIBIÓ el resultado final —
 *    por dispositivo, el endpoint aceptado; por usuario, si al menos un
 *    dispositivo suyo lo recibió. Un fallo transitorio deja el watcher en pie,
 *    así el reintento del cliente (force) lo alcanza.
 */
export function watchersToRemove(
  rows: WatcherSubscriptionRow[],
  delivery: Pick<DeliveryResult, 'deliveredEndpoints' | 'staleEndpoints'>,
  opts: { finished: boolean },
): WatcherRemoval {
  const delivered = new Set(delivery.deliveredEndpoints)
  const stale = new Set(delivery.staleEndpoints)

  const subscriptionIds = opts.finished
    ? rows.filter(r => delivered.has(r.endpoint) || stale.has(r.endpoint)).map(r => r.id)
    : []

  const byUser = new Map<string, WatcherSubscriptionRow[]>()
  for (const r of rows) {
    if (!r.user_id) continue
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r])
  }
  const userIds: string[] = []
  for (const [userId, subs] of byUser) {
    const allStale = subs.every(s => stale.has(s.endpoint))
    const anyDelivered = subs.some(s => delivered.has(s.endpoint))
    if (allStale || (opts.finished && anyDelivered)) userIds.push(userId)
  }
  return { subscriptionIds, userIds }
}

/**
 * Retira de la ronda los watchers de las identidades dadas (dispositivos y
 * usuarios). Un DELETE que falla se lanza, no se traga: si el watcher de
 * quien ya recibió el resultado final quedara en pie sin que nadie lo sepa, el
 * reintento del cliente se lo volvería a mandar (review 5, M-a).
 */
export async function removeWatchersByIdentity(admin: SupabaseClient, codigo: string, removal: WatcherRemoval): Promise<void> {
  if (removal.subscriptionIds.length > 0) {
    const { error } = await admin.from('round_watchers').delete().eq('ronda_codigo', codigo).in('push_subscription_id', removal.subscriptionIds)
    if (error) throw new Error(`round_watchers delete (dispositivos): ${error.message}`)
  }
  if (removal.userIds.length > 0) {
    const { error } = await admin.from('round_watchers').delete().eq('ronda_codigo', codigo).in('user_id', removal.userIds)
    if (error) throw new Error(`round_watchers delete (usuarios): ${error.message}`)
  }
}

/**
 * Suscripciones a las que hay que empujar una actualización de la ronda:
 * todos los dispositivos de los usuarios que la siguen + los dispositivos
 * anónimos que la siguen. Deduplicado por endpoint. Cada fila trae su
 * identidad (id, user_id) para decidir después qué watchers se retiran sin
 * volver a leer push_subscriptions (que ya puede tener las muertas borradas).
 *
 * Sin exclusión del remitente: quien toca "Seguir" en su propia ronda pidió
 * esa notificación (es otro tag que la del jugador). Excluir por user_id
 * dejaba sin push al jugador que se sigue a sí mismo (caso f6cca8e3).
 */
export async function resolveWatcherSubscriptions(admin: SupabaseClient, codigo: string): Promise<WatcherSubscriptionRow[]> {
  const { data: watchers } = await admin
    .from('round_watchers')
    .select('user_id, push_subscription_id')
    .eq('ronda_codigo', codigo)
    .limit(MAX_WATCHERS_PER_ROUND)
  if (!watchers || watchers.length === 0) return []

  const userIds = Array.from(new Set(watchers.map(w => w.user_id as string | null).filter((id): id is string => !!id)))
  const subIds = Array.from(new Set(watchers.map(w => w.push_subscription_id as string | null).filter((id): id is string => !!id)))

  const rows: WatcherSubscriptionRow[] = []
  if (userIds.length > 0) {
    const { data } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds)
    rows.push(...((data ?? []) as WatcherSubscriptionRow[]))
  }
  if (subIds.length > 0) {
    const { data } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('id', subIds)
    rows.push(...((data ?? []) as WatcherSubscriptionRow[]))
  }
  return dedupeByEndpoint(rows)
}
