/**
 * src/lib/push/schemas.ts — esquemas compartidos de los endpoints /api/push/*.
 * Fuente única del código de ronda y de la forma de una suscripción push.
 */

import { z } from 'zod'

export const RondaCodigoSchema = z.string().trim().min(1).max(50)

/**
 * Hosts de servicios de push reconocidos. Una suscripción con endpoint fuera
 * de esta lista se rechaza: si no, un anónimo registra https://victima.com
 * como endpoint y el servidor le manda un POST cifrado por cada actualización
 * (SSRF / amplificador). Lista extensible; un host nuevo legítimo se detecta
 * porque el follow devuelve 400 y se registra en captureError.
 */
export const PUSH_SERVICE_HOSTS: ReadonlyArray<{ host: string; subdomains?: boolean }> = [
  { host: 'fcm.googleapis.com' },                       // Chrome / Edge / Samsung Internet (Android, desktop)
  { host: 'web.push.apple.com' },                       // Safari / PWA iOS y macOS
  { host: 'push.apple.com', subdomains: true },         // variantes regionales de Apple
  { host: 'updates.push.services.mozilla.com' },        // Firefox
  { host: 'notify.windows.com', subdomains: true },     // Edge (WNS)
]

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return PUSH_SERVICE_HOSTS.some(({ host: allowed, subdomains }) =>
    host === allowed || (subdomains === true && host.endsWith(`.${allowed}`)),
  )
}

const EndpointSchema = z.string().max(2048).refine(isAllowedPushEndpoint, 'endpoint de push no reconocido')

/** Forma que entrega `PushSubscription.toJSON()` en el browser. */
export const PushSubscriptionJsonSchema = z.object({
  endpoint: EndpointSchema,
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
})
export type PushSubscriptionJson = z.infer<typeof PushSubscriptionJsonSchema>

/** Lo mínimo para probar posesión de un dispositivo: endpoint + secreto `auth`. */
export const PushSubscriptionProofSchema = z.object({
  endpoint: EndpointSchema,
  keys: z.object({ auth: z.string().min(8).max(256) }),
})
