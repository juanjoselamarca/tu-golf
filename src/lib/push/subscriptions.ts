/**
 * src/lib/push/subscriptions.ts — acceso a `push_subscriptions` (service role).
 *
 * Toda escritura de suscripciones pasa por acá. Las políticas RLS no dan acceso
 * al rol anon y sólo lo propio al authenticated (migración 20260929): las filas
 * anónimas (user_id NULL) existen únicamente vía estas funciones, después de
 * que la API route validó el request.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import type { PushSubscriptionJson } from './schemas'

export { PushSubscriptionJsonSchema, type PushSubscriptionJson } from './schemas'

/** Comparación en tiempo constante de dos secretos (evita filtrar por timing). */
export function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** El endpoint ya está registrado con otro secreto `auth`: no es este dispositivo. */
export class SubscriptionOwnershipError extends Error {
  constructor() { super('La suscripción pertenece a otro dispositivo') }
}

export interface UpsertSubscriptionInput {
  subscription: PushSubscriptionJson
  /** Usuario dueño. Si viene undefined NO se toca el user_id existente (un
   *  request anónimo nunca "des-asigna" la suscripción de un usuario). */
  userId?: string
}

/**
 * Upsert por endpoint. Devuelve el id de la fila.
 *
 * Prueba de posesión: si el endpoint ya existe, el `auth` enviado tiene que
 * coincidir con el guardado. Si no, se rechaza SIN escribir — de otro modo un
 * anónimo con el endpoint ajeno sobrescribiría sus claves (rompiendo la
 * entrega real y habilitando el DELETE), y con sesión se lo reasignaría.
 */
export async function upsertPushSubscription(
  admin: SupabaseClient,
  input: UpsertSubscriptionInput,
): Promise<{ id: string }> {
  const { subscription, userId } = input

  const { data: existing } = await admin
    .from('push_subscriptions')
    .select('id, auth')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()
  if (existing && !secretsMatch(existing.auth as string, subscription.keys.auth)) {
    throw new SubscriptionOwnershipError()
  }

  const row: Record<string, unknown> = {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    updated_at: new Date().toISOString(),
  }
  if (userId) row.user_id = userId

  const { data, error } = await admin
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`push_subscriptions upsert: ${error?.message ?? 'sin fila'}`)
  return { id: data.id as string }
}

/**
 * Busca la suscripción por endpoint y exige que el secreto `auth` coincida:
 * es la prueba de posesión del dispositivo para operaciones anónimas
 * (dejar de seguir). Un endpoint ajeno sin su `auth` no sirve.
 */
export async function findOwnedSubscription(
  admin: SupabaseClient,
  endpoint: string,
  authSecret: string,
): Promise<{ id: string; user_id: string | null } | null> {
  const { data } = await admin
    .from('push_subscriptions')
    .select('id, user_id, auth')
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (!data || !secretsMatch(data.auth as string, authSecret)) return null
  return { id: data.id as string, user_id: (data.user_id as string | null) ?? null }
}

/**
 * El servicio de push rotó la suscripción del dispositivo (pushsubscriptionchange).
 * Con la prueba de posesión de la VIEJA (endpoint + auth) se actualiza la MISMA
 * fila con la nueva: el id no cambia, así los watchers (rondas seguidas, con o
 * sin cuenta) sobreviven a la rotación. Devuelve null si la vieja no es de
 * este dispositivo o no existe.
 */
export async function rotatePushSubscription(
  admin: SupabaseClient,
  old: { endpoint: string; auth: string },
  next: PushSubscriptionJson,
): Promise<{ id: string } | null> {
  const owned = await findOwnedSubscription(admin, old.endpoint, old.auth)
  if (!owned) return null
  if (next.endpoint !== old.endpoint) {
    // El endpoint nuevo ya existe como OTRA fila: no se borra nada sin probar
    // posesión de esa fila. Es un conflicto (409), no una limpieza.
    const { data: clash } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', next.endpoint)
      .neq('id', owned.id)
      .maybeSingle()
    if (clash) throw new SubscriptionOwnershipError()
  }
  const { error } = await admin
    .from('push_subscriptions')
    .update({ endpoint: next.endpoint, p256dh: next.keys.p256dh, auth: next.keys.auth, updated_at: new Date().toISOString() })
    .eq('id', owned.id)
  if (error) throw new Error(`push_subscriptions rotate: ${error.message}`)
  return { id: owned.id }
}

/** Borra suscripciones que el proveedor declaró muertas (410/404). Cascada → round_watchers. */
export async function deleteStaleSubscriptions(admin: SupabaseClient, endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return
  await admin.from('push_subscriptions').delete().in('endpoint', endpoints)
}

/** Borra la suscripción de un usuario autenticado (logout / desactivar). */
export async function deleteUserSubscription(admin: SupabaseClient, userId: string, endpoint: string): Promise<void> {
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId)
}
