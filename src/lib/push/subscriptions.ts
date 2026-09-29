/**
 * src/lib/push/subscriptions.ts — acceso a `push_subscriptions` (service role).
 *
 * Toda escritura de suscripciones pasa por acá. Las políticas RLS no dan acceso
 * al rol anon y sólo lo propio al authenticated (migración 20260929): las filas
 * anónimas (user_id NULL) existen únicamente vía estas funciones, después de
 * que la API route validó el request.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

/** Forma que entrega `PushSubscription.toJSON()` en el browser. */
export const PushSubscriptionJsonSchema = z.object({
  endpoint: z.string().url().max(2048).refine(u => u.startsWith('https://'), 'endpoint debe ser https'),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
})
export type PushSubscriptionJson = z.infer<typeof PushSubscriptionJsonSchema>

export interface UpsertSubscriptionInput {
  subscription: PushSubscriptionJson
  /** Usuario dueño. Si viene undefined NO se toca el user_id existente (un
   *  request anónimo nunca "des-asigna" la suscripción de un usuario). */
  userId?: string
}

/** Upsert por endpoint. Devuelve el id de la fila. */
export async function upsertPushSubscription(
  admin: SupabaseClient,
  input: UpsertSubscriptionInput,
): Promise<{ id: string }> {
  const { subscription, userId } = input
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
  if (!data || data.auth !== authSecret) return null
  return { id: data.id as string, user_id: (data.user_id as string | null) ?? null }
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
