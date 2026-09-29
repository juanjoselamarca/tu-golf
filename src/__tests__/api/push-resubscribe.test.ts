/** /api/push/resubscribe — rotación de suscripción (pushsubscriptionchange) con prueba de posesión de la vieja. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: vi.fn(() => ({ tag: 'admin' })) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('@/lib/push/subscriptions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/push/subscriptions')>()
  return { ...real, rotatePushSubscription: vi.fn() }
})

import { POST } from '@/app/api/push/resubscribe/route'
import { rotatePushSubscription } from '@/lib/push/subscriptions'

const OLD = { endpoint: 'https://fcm.googleapis.com/fcm/send/viejo', keys: { auth: 'OLDAUTHSECRET' } }
const NEXT = { endpoint: 'https://fcm.googleapis.com/fcm/send/nuevo', keys: { p256dh: 'BNEWKEYNEWKEYNEWKEY', auth: 'NEWAUTHSECRET' } }

let ip = 0
const req = (body: unknown) => new NextRequest('http://localhost/api/push/resubscribe', {
  method: 'POST', body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${++ip}` },
})

beforeEach(() => vi.clearAllMocks())

describe('POST /api/push/resubscribe', () => {
  it('rota con la prueba de posesión de la vieja', async () => {
    vi.mocked(rotatePushSubscription).mockResolvedValue({ id: 'sub-1' })
    const res = await POST(req({ old: OLD, subscription: NEXT }))
    expect(res.status).toBe(200)
    expect(rotatePushSubscription).toHaveBeenCalledWith(expect.anything(), { endpoint: OLD.endpoint, auth: OLD.keys.auth }, NEXT)
  })

  it('vieja ajena o inexistente → 404 (nada se escribe)', async () => {
    vi.mocked(rotatePushSubscription).mockResolvedValue(null)
    expect((await POST(req({ old: OLD, subscription: NEXT }))).status).toBe(404)
  })

  it('400 si la nueva no es de un servicio de push reconocido o falta la vieja', async () => {
    expect((await POST(req({ old: OLD, subscription: { ...NEXT, endpoint: 'https://victima.com/x' } }))).status).toBe(400)
    expect((await POST(req({ subscription: NEXT }))).status).toBe(400)
    expect(rotatePushSubscription).not.toHaveBeenCalled()
  })
})
