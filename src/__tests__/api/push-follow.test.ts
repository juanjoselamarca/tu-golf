/**
 * Tests de /api/push/follow — seguir una ronda con y sin cuenta.
 *
 * Se mockea la sesión (cookies() de next/headers necesita request context), el
 * admin client y la capa src/lib/push/*. Lo que se valida es el contrato de
 * seguridad del endpoint: identidad por usuario o por dispositivo, prueba de
 * posesión (`auth`) para el anónimo, allowlist de hosts, ronda en curso, tope
 * de seguidores, rate limit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUserMock = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}))

const rondaRow = { value: { id: 'r1', estado: 'en_curso' } as { id: string; estado: string } | null }
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: rondaRow.value }) }),
      }),
    }),
  })),
}))

vi.mock('@/lib/push/subscriptions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/push/subscriptions')>()
  return {
    ...real,
    upsertPushSubscription: vi.fn(async () => ({ id: 'sub-1' })),
    findOwnedSubscription: vi.fn(),
  }
})
vi.mock('@/lib/push/watchers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/push/watchers')>()
  return {
    ...real,
    addWatcher: vi.fn(async () => {}),
    removeWatcher: vi.fn(async () => {}),
  }
})
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { POST, DELETE } from '@/app/api/push/follow/route'
import { upsertPushSubscription, findOwnedSubscription, SubscriptionOwnershipError } from '@/lib/push/subscriptions'
import { addWatcher, removeWatcher, WatcherLimitError } from '@/lib/push/watchers'

const SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BPUBLICKEYPUBLICKEYPUBLICKEY', auth: 'AUTHSECRET123' },
}

let ipCounter = 0
function req(method: 'POST' | 'DELETE', body: unknown, ip?: string): NextRequest {
  return new NextRequest('http://localhost/api/push/follow', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  rondaRow.value = { id: 'r1', estado: 'en_curso' }
  getUserMock.mockResolvedValue({ data: { user: null } })
  vi.mocked(upsertPushSubscription).mockResolvedValue({ id: 'sub-1' })
  vi.mocked(addWatcher).mockResolvedValue(undefined)
})

describe('POST /api/push/follow', () => {
  it('anónimo: registra la suscripción sin user_id y el watcher por dispositivo', async () => {
    const res = await POST(req('POST', { codigo: 'ABC123', subscription: SUB }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ following: true, identity: 'device' })
    expect(upsertPushSubscription).toHaveBeenCalledWith(expect.anything(), { subscription: SUB, userId: undefined })
    expect(addWatcher).toHaveBeenCalledWith(expect.anything(), 'ABC123', { kind: 'device', subscriptionId: 'sub-1' })
  })

  it('con sesión: refresca la suscripción del dispositivo con su user_id y el watcher por usuario', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-9' } } })
    const res = await POST(req('POST', { codigo: 'ABC123', subscription: SUB }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ following: true, identity: 'user' })
    expect(upsertPushSubscription).toHaveBeenCalledWith(expect.anything(), { subscription: SUB, userId: 'u-9' })
    expect(addWatcher).toHaveBeenCalledWith(expect.anything(), 'ABC123', { kind: 'user', userId: 'u-9' })
  })

  it('400 con suscripción inválida (http, host fuera de la allowlist, sin keys) — nada se escribe', async () => {
    const http = await POST(req('POST', { codigo: 'ABC123', subscription: { endpoint: 'http://fcm.googleapis.com/x', keys: SUB.keys } }))
    expect(http.status).toBe(400)
    const ssrf = await POST(req('POST', { codigo: 'ABC123', subscription: { endpoint: 'https://victima.com/webhook', keys: SUB.keys } }))
    expect(ssrf.status).toBe(400)
    const noKeys = await POST(req('POST', { codigo: 'ABC123', subscription: { endpoint: SUB.endpoint } }))
    expect(noKeys.status).toBe(400)
    expect(upsertPushSubscription).not.toHaveBeenCalled()
    expect(addWatcher).not.toHaveBeenCalled()
  })

  it('endpoint ajeno (auth distinto) → 409 sin watcher', async () => {
    vi.mocked(upsertPushSubscription).mockRejectedValue(new SubscriptionOwnershipError())
    const res = await POST(req('POST', { codigo: 'ABC123', subscription: SUB }))
    expect(res.status).toBe(409)
    expect(addWatcher).not.toHaveBeenCalled()
  })

  it('ronda llena → 429', async () => {
    vi.mocked(addWatcher).mockRejectedValue(new WatcherLimitError('ABC123'))
    const res = await POST(req('POST', { codigo: 'ABC123', subscription: SUB }))
    expect(res.status).toBe(429)
  })

  it('404 si la ronda no existe, 409 si ya terminó', async () => {
    rondaRow.value = null
    expect((await POST(req('POST', { codigo: 'NOPE', subscription: SUB }))).status).toBe(404)
    rondaRow.value = { id: 'r1', estado: 'finalizada' }
    expect((await POST(req('POST', { codigo: 'DONE', subscription: SUB }))).status).toBe(409)
    expect(addWatcher).not.toHaveBeenCalled()
  })

  it('rate limit por IP: la solicitud 21 en un minuto recibe 429', async () => {
    const ip = '203.0.113.7'
    for (let i = 0; i < 20; i++) {
      expect((await POST(req('POST', { codigo: `RONDA${i}`, subscription: SUB }, ip))).status).toBe(200)
    }
    expect((await POST(req('POST', { codigo: 'RONDA99', subscription: SUB }, ip))).status).toBe(429)
  })

  it('rate limit por IP y ronda: una IP no llena el cupo de UNA ronda (6ª en un minuto → 429)', async () => {
    const ip = '203.0.113.8'
    for (let i = 0; i < 5; i++) {
      expect((await POST(req('POST', { codigo: 'MISMA1', subscription: SUB }, ip))).status).toBe(200)
    }
    expect((await POST(req('POST', { codigo: 'MISMA1', subscription: SUB }, ip))).status).toBe(429)
    expect((await POST(req('POST', { codigo: 'OTRA22', subscription: SUB }, ip))).status).toBe(200)
  })

  it('409 lleva `code` legible por el cliente (round_over / device_owned_by_other)', async () => {
    rondaRow.value = { id: 'r1', estado: 'finalizada' }
    expect(await (await POST(req('POST', { codigo: 'DONE', subscription: SUB }))).json()).toMatchObject({ code: 'round_over' })
    rondaRow.value = { id: 'r1', estado: 'en_curso' }
    vi.mocked(upsertPushSubscription).mockRejectedValue(new SubscriptionOwnershipError())
    expect(await (await POST(req('POST', { codigo: 'ABC123', subscription: SUB }))).json()).toMatchObject({ code: 'device_owned_by_other' })
  })
})

describe('DELETE /api/push/follow', () => {
  it('anónimo sin suscripción → 400 (no hay a quién dejar de seguir)', async () => {
    const res = await DELETE(req('DELETE', { codigo: 'ABC123' }))
    expect(res.status).toBe(400)
    expect(removeWatcher).not.toHaveBeenCalled()
  })

  it('anónimo con endpoint ajeno (auth no coincide) → 404, no toca nada', async () => {
    vi.mocked(findOwnedSubscription).mockResolvedValue(null)
    const res = await DELETE(req('DELETE', {
      codigo: 'ABC123',
      subscription: { endpoint: SUB.endpoint, keys: { auth: 'WRONGSECRET' } },
    }))
    expect(res.status).toBe(404)
    expect(findOwnedSubscription).toHaveBeenCalledWith(expect.anything(), SUB.endpoint, 'WRONGSECRET')
    expect(removeWatcher).not.toHaveBeenCalled()
  })

  it('anónimo con su propia suscripción → borra el watcher por dispositivo', async () => {
    vi.mocked(findOwnedSubscription).mockResolvedValue({ id: 'sub-1', user_id: null })
    const res = await DELETE(req('DELETE', {
      codigo: 'ABC123',
      subscription: { endpoint: SUB.endpoint, keys: { auth: SUB.keys.auth } },
    }))
    expect(res.status).toBe(200)
    expect(removeWatcher).toHaveBeenCalledWith(expect.anything(), 'ABC123', { kind: 'device', subscriptionId: 'sub-1' })
  })

  it('sin sesión, dispositivo de un usuario (desde la notificación con la app cerrada) → borra también el watcher del usuario (review I-C)', async () => {
    vi.mocked(findOwnedSubscription).mockResolvedValue({ id: 'sub-1', user_id: 'u-9' })
    const res = await DELETE(req('DELETE', {
      codigo: 'ABC123',
      subscription: { endpoint: SUB.endpoint, keys: { auth: SUB.keys.auth } },
    }))
    expect(res.status).toBe(200)
    expect(removeWatcher).toHaveBeenCalledWith(expect.anything(), 'ABC123', { kind: 'device', subscriptionId: 'sub-1' })
    expect(removeWatcher).toHaveBeenCalledWith(expect.anything(), 'ABC123', { kind: 'user', userId: 'u-9' })
  })

  it('con sesión → borra el watcher del usuario (todos sus dispositivos)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-9' } } })
    const res = await DELETE(req('DELETE', { codigo: 'ABC123' }))
    expect(res.status).toBe(200)
    expect(removeWatcher).toHaveBeenCalledWith(expect.anything(), 'ABC123', { kind: 'user', userId: 'u-9' })
  })
})
