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
import type { PushSubscriptionRow } from './deliver'
import { dedupeByEndpoint } from './deliver'

export type WatcherIdentity =
  | { kind: 'user'; userId: string }
  | { kind: 'device'; subscriptionId: string }

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
 * Tras el "Resultado final": se retiran sólo los watchers cuyo dispositivo lo
 * RECIBIÓ (o cuya suscripción está muerta). Un fallo transitorio del servicio de
 * push deja el watcher en pie, así el reintento del cliente (force) lo alcanza.
 * Por usuario: todos sus watchers de la ronda, si al menos un dispositivo suyo
 * recibió el resultado.
 */
export async function removeWatchersReached(admin: SupabaseClient, codigo: string, endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id')
    .in('endpoint', endpoints)
  const subIds = (subs ?? []).map(s => s.id as string)
  const userIds = Array.from(new Set((subs ?? []).map(s => s.user_id as string | null).filter((u): u is string => !!u)))
  if (subIds.length > 0) {
    await admin.from('round_watchers').delete().eq('ronda_codigo', codigo).in('push_subscription_id', subIds)
  }
  if (userIds.length > 0) {
    await admin.from('round_watchers').delete().eq('ronda_codigo', codigo).in('user_id', userIds)
  }
}

/**
 * Suscripciones a las que hay que empujar una actualización de la ronda:
 * todos los dispositivos de los usuarios que la siguen + los dispositivos
 * anónimos que la siguen. Deduplicado por endpoint.
 *
 * Sin exclusión del remitente: quien toca "Seguir" en su propia ronda pidió
 * esa notificación (es otro tag que la del jugador). Excluir por user_id
 * dejaba sin push al jugador que se sigue a sí mismo (caso f6cca8e3).
 */
export async function resolveWatcherSubscriptions(admin: SupabaseClient, codigo: string): Promise<PushSubscriptionRow[]> {
  const { data: watchers } = await admin
    .from('round_watchers')
    .select('user_id, push_subscription_id')
    .eq('ronda_codigo', codigo)
    .limit(MAX_WATCHERS_PER_ROUND)
  if (!watchers || watchers.length === 0) return []

  const userIds = Array.from(new Set(watchers.map(w => w.user_id as string | null).filter((id): id is string => !!id)))
  const subIds = Array.from(new Set(watchers.map(w => w.push_subscription_id as string | null).filter((id): id is string => !!id)))

  const rows: PushSubscriptionRow[] = []
  if (userIds.length > 0) {
    const { data } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', userIds)
    rows.push(...((data ?? []) as PushSubscriptionRow[]))
  }
  if (subIds.length > 0) {
    const { data } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('id', subIds)
    rows.push(...((data ?? []) as PushSubscriptionRow[]))
  }
  return dedupeByEndpoint(rows)
}
