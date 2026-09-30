/**
 * src/lib/push/deliver.ts — entrega de Web Push a una lista de suscripciones.
 *
 * Fuente única del loop de envío + limpieza de suscripciones muertas. Antes
 * /api/push/send y /api/push/round-update tenían cada uno su copia del loop y
 * de la inicialización VAPID.
 *
 * `deliverToSubscriptions` es puro respecto al transporte: recibe el `send`
 * (inyectable en tests). `sendWebPush` es el transporte real (web-push + VAPID).
 */

import webpush from 'web-push'

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export interface DeliveryResult {
  sent: number
  /** Envíos rechazados en total (muertos + transitorios). */
  failed: number
  /** Fallos que vale la pena reintentar: NO cuentan las suscripciones muertas (410/404). */
  transientFailed: number
  /** Endpoints a los que el servicio de push aceptó el mensaje. */
  deliveredEndpoints: string[]
  /** Endpoints que el proveedor declaró muertos (410 Gone / 404). Borrarlos. */
  staleEndpoints: string[]
}

export interface PushSendOptions {
  /** Segundos que el servicio de push retiene el mensaje si el dispositivo está offline. */
  ttlSeconds: number
  /**
   * Tema (≤32 chars, base64url): el servicio de push COLAPSA los mensajes
   * pendientes con el mismo topic y entrega sólo el último — un teléfono en
   * Doze recibe una actualización, no diez.
   */
  topic?: string
}

export type PushSender = (sub: PushSubscriptionRow, payload: string, opts: PushSendOptions) => Promise<void>

/** Códigos con los que FCM / APNs / Mozilla declaran una suscripción muerta. */
export const STALE_STATUS_CODES: ReadonlySet<number> = new Set([404, 410])

/** Socket timeout por envío: un endpoint que no responde no cuelga la función. */
export const PUSH_SOCKET_TIMEOUT_MS = 5_000

/** TTL de una actualización de ronda en curso: en 10 min ya hay otra más nueva. */
export const TTL_ROUND_UPDATE_SECONDS = 600
/** TTL del resultado final: vale la pena entregarlo aunque el teléfono vuelva mañana. */
export const TTL_ROUND_FINISHED_SECONDS = 86_400

function statusOf(err: unknown): number | undefined {
  return (err as { statusCode?: number } | null)?.statusCode
}

/** Un mismo dispositivo puede aparecer por dos caminos (usuario + suscripción). */
export function dedupeByEndpoint<T extends { endpoint: string }>(subs: T[]): T[] {
  const seen = new Set<string>()
  return subs.filter(s => {
    if (seen.has(s.endpoint)) return false
    seen.add(s.endpoint)
    return true
  })
}

export async function deliverToSubscriptions(
  subs: PushSubscriptionRow[],
  payload: string,
  send: PushSender,
  opts: PushSendOptions,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0, transientFailed: 0, deliveredEndpoints: [], staleEndpoints: [] }
  await Promise.allSettled(
    dedupeByEndpoint(subs).map(async (sub) => {
      try {
        await send(sub, payload, opts)
        result.sent++
        result.deliveredEndpoints.push(sub.endpoint)
      } catch (err) {
        result.failed++
        const code = statusOf(err)
        if (code != null && STALE_STATUS_CODES.has(code)) result.staleEndpoints.push(sub.endpoint)
        else result.transientFailed++
      }
    }),
  )
  return result
}

// ── Transporte real ──

let vapidInitialized = false

/**
 * VAPID lazy — se ejecuta al primer envío, NO a module-load. web-push valida
 * las keys dentro de setVapidDetails() y Next ejecuta el top-level del módulo
 * durante "collect page data": con env placeholder rompía el build (CI 23-abr).
 */
export function ensureVapidInitialized(): void {
  if (vapidInitialized) return
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL || 'mailto:juanjoselamarca@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  vapidInitialized = true
}

/** Opciones de request para web-push a partir de las de dominio (una sola traducción). */
export function toWebPushRequestOptions(opts: PushSendOptions): { timeout: number; TTL: number; topic?: string } {
  return {
    timeout: PUSH_SOCKET_TIMEOUT_MS,
    TTL: opts.ttlSeconds,
    ...(opts.topic ? { topic: opts.topic } : {}),
  }
}

export const sendWebPush: PushSender = async (sub, payload, opts) => {
  ensureVapidInitialized()
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload,
    toWebPushRequestOptions(opts),
  )
}
