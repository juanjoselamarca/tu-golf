/**
 * src/lib/push/indice.ts — push al teléfono cuando el cron diario detecta que
 * FedeGolf cambió el índice de un usuario (Fase 1b, plan
 * docs/superpowers/plans/2026-10-19-fedegolf-integracion.md).
 *
 * El aviso en la app (toast, una vez por dispositivo) ya existía, pero solo lo ve
 * quien abre la app: el push llega aunque no la abra. Mismo copy que el toast
 * (`construirAvisoIndice`, fuente única) y respeta la preferencia
 * `notification_preferences.indice_cambios` (sin fila = activado, el default).
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { construirAvisoIndice } from '@/lib/fedegolf/aviso-indice'
import {
  deliverToSubscriptions,
  sendWebPush,
  TTL_ROUND_FINISHED_SECONDS,
  type PushSender,
  type PushSubscriptionRow,
} from './deliver'
import { deleteStaleSubscriptions } from './subscriptions'

export type ResultadoAvisoIndice = 'enviado' | 'sin_cambio' | 'desactivado' | 'sin_dispositivos' | 'no_entregado'

export interface DepsAvisoIndice {
  quiereAviso: (userId: string) => Promise<boolean>
  suscripciones: (userId: string) => Promise<PushSubscriptionRow[]>
  enviar: PushSender
  borrarMuertas: (endpoints: string[]) => Promise<void>
}

/**
 * Tema por usuario (≤32 chars base64url): si el teléfono está apagado varios días
 * y el índice cambia dos veces, el servicio de push entrega solo el último.
 */
export function topicAvisoIndice(userId: string): string {
  return createHash('sha256').update(`indice:${userId}`).digest('base64url').slice(0, 32)
}

export async function notificarCambioIndice(
  deps: DepsAvisoIndice,
  userId: string,
  nuevo: number,
  anterior: number | null,
): Promise<ResultadoAvisoIndice> {
  // Sin índice anterior no hay cambio que narrar (es la primera sincronización,
  // y esa la ve el usuario al vincular).
  const aviso = anterior == null ? null : construirAvisoIndice(nuevo, anterior)
  if (!aviso) return 'sin_cambio'
  if (!(await deps.quiereAviso(userId))) return 'desactivado'

  const subs = await deps.suscripciones(userId)
  if (subs.length === 0) return 'sin_dispositivos'

  const payload = JSON.stringify({
    title: aviso.title,
    body: aviso.message,
    tag: 'indice-fedegolf',
    data: { url: '/perfil' },
  })
  const r = await deliverToSubscriptions(subs, payload, deps.enviar, {
    // Vale aunque el teléfono vuelva mañana: el índice no se vuelve viejo en horas.
    ttlSeconds: TTL_ROUND_FINISHED_SECONDS,
    topic: topicAvisoIndice(userId),
  })
  await deps.borrarMuertas(r.staleEndpoints)
  return r.sent > 0 ? 'enviado' : 'no_entregado'
}

/** Cableado real (service role: el cron no tiene sesión de usuario). */
export function depsAvisoIndice(admin: SupabaseClient): DepsAvisoIndice {
  return {
    quiereAviso: async (userId) => {
      const { data, error } = await admin
        .from('notification_preferences')
        .select('indice_cambios')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data?.indice_cambios !== false
    },
    suscripciones: async (userId) => {
      const { data, error } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId)
      if (error) throw error
      return (data ?? []) as PushSubscriptionRow[]
    },
    enviar: sendWebPush,
    borrarMuertas: (endpoints) => deleteStaleSubscriptions(admin, endpoints),
  }
}
