import { describe, it, expect, vi } from 'vitest'

vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }))

import {
  deliverToSubscriptions,
  dedupeByEndpoint,
  toWebPushRequestOptions,
  PUSH_SOCKET_TIMEOUT_MS,
  type PushSubscriptionRow,
  type PushSendOptions,
} from './deliver'

const sub = (endpoint: string): PushSubscriptionRow => ({ endpoint, p256dh: 'k', auth: 'a' })
const OPTS: PushSendOptions = { ttlSeconds: 600, topic: 'ABC123' }

describe('deliverToSubscriptions', () => {
  it('410 Gone y 404 marcan la suscripción como muerta; otros errores no', async () => {
    const send = vi.fn(async (s: PushSubscriptionRow) => {
      if (s.endpoint.includes('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      if (s.endpoint.includes('nf')) throw Object.assign(new Error('NF'), { statusCode: 404 })
      if (s.endpoint.includes('boom')) throw Object.assign(new Error('boom'), { statusCode: 500 })
    })
    const r = await deliverToSubscriptions(
      [sub('https://fcm/ok'), sub('https://fcm/gone'), sub('https://fcm/nf'), sub('https://fcm/boom')],
      '{}', send, OPTS,
    )
    expect(r.sent).toBe(1)
    expect(r.failed).toBe(3)
    expect(r.staleEndpoints.sort()).toEqual(['https://fcm/gone', 'https://fcm/nf'])
  })

  it('un error sin statusCode no borra la suscripción (red caída ≠ suscripción muerta)', async () => {
    const send = vi.fn(async () => { throw new Error('ECONNRESET') })
    const r = await deliverToSubscriptions([sub('https://fcm/a')], '{}', send, OPTS)
    expect(r.failed).toBe(1)
    expect(r.staleEndpoints).toEqual([])
  })

  it('el mismo dispositivo por dos caminos recibe UN solo push, con las opciones de envío', async () => {
    const send = vi.fn(async () => {})
    const r = await deliverToSubscriptions([sub('https://fcm/a'), sub('https://fcm/a'), sub('https://fcm/b')], '{}', send, OPTS)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith(expect.anything(), '{}', OPTS)
    expect(r.sent).toBe(2)
  })

  it('lista vacía → nada enviado, sin error', async () => {
    const send = vi.fn(async () => {})
    const r = await deliverToSubscriptions([], '{}', send, OPTS)
    expect(r).toEqual({ sent: 0, failed: 0, staleEndpoints: [] })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('toWebPushRequestOptions — timeout, TTL y topic llegan a web-push', () => {
  it('siempre timeout de socket + TTL; topic sólo si viene', () => {
    expect(toWebPushRequestOptions({ ttlSeconds: 600, topic: 'ABC123' }))
      .toEqual({ timeout: PUSH_SOCKET_TIMEOUT_MS, TTL: 600, topic: 'ABC123' })
    expect(toWebPushRequestOptions({ ttlSeconds: 86400 }))
      .toEqual({ timeout: PUSH_SOCKET_TIMEOUT_MS, TTL: 86400 })
    expect(PUSH_SOCKET_TIMEOUT_MS).toBe(5000)
  })
})

describe('dedupeByEndpoint', () => {
  it('conserva el primero de cada endpoint', () => {
    const out = dedupeByEndpoint([{ endpoint: 'x', n: 1 }, { endpoint: 'x', n: 2 }, { endpoint: 'y', n: 3 }])
    expect(out).toEqual([{ endpoint: 'x', n: 1 }, { endpoint: 'y', n: 3 }])
  })
})
