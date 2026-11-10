// POST /api/push/send — el envío manual del admin.
//
// Bug que cubre (10-nov-2026): "sin userIds → todas las suscripciones" se
// decidía con `userIds && userIds.length > 0`, así que una lista VACÍA
// (un filtro que no encontró a nadie) caía en el broadcast a todos los
// usuarios. Y un `userIds` que no era lista (un string suelto) llegaba
// directo a `.in()`. Omitir el campo es la única forma de pedir un broadcast.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const isAdmin = vi.fn()
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }))

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

// Query builder de push_subscriptions: registra qué filtro se aplicó.
const filtros: string[] = []
function builder() {
  const result = { data: [{ endpoint: 'e1', p256dh: 'p', auth: 'a' }], error: null }
  const q = {
    in: (col: string, vals: unknown) => { filtros.push(`in:${col}:${JSON.stringify(vals)}`); return q },
    not: (col: string) => { filtros.push(`not:${col}`); return q },
    then: (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res),
  }
  return q
}
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => builder() }) }),
}))

const deliver = vi.fn()
vi.mock('@/lib/push/deliver', () => ({
  deliverToSubscriptions: (...a: unknown[]) => deliver(...a),
  sendWebPush: vi.fn(),
  TTL_ROUND_FINISHED_SECONDS: 60,
}))
vi.mock('@/lib/push/subscriptions', () => ({ deleteStaleSubscriptions: vi.fn() }))

import { POST } from '../route'

const UID = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const PAYLOAD = { title: 'Hola', body: 'Prueba' }

function req(body: unknown): Request {
  return new Request('http://x/api/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  filtros.length = 0
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  isAdmin.mockResolvedValue(true)
  deliver.mockResolvedValue({ sent: 1, failed: 0, staleEndpoints: [] })
})

describe('POST /api/push/send', () => {
  it('403 a quien no es admin', async () => {
    isAdmin.mockResolvedValue(false)
    const res = await POST(req({ payload: PAYLOAD }))
    expect(res.status).toBe(403)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('una lista de destinatarios VACÍA no se convierte en broadcast a todos', async () => {
    const res = await POST(req({ userIds: [], payload: PAYLOAD }))
    expect(res.status).toBe(400)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('userIds que no es lista de UUID → 400 sin enviar', async () => {
    for (const userIds of [UID, [UID, 'no-es-uuid'], [42], null]) {
      const res = await POST(req({ userIds, payload: PAYLOAD }))
      expect(res.status, JSON.stringify(userIds)).toBe(400)
    }
    expect(deliver).not.toHaveBeenCalled()
  })

  it('includeAnonymous que no es booleano → 400 ("false" en texto no abre a anónimos)', async () => {
    const res = await POST(req({ includeAnonymous: 'false', payload: PAYLOAD }))
    expect(res.status).toBe(400)
    expect(deliver).not.toHaveBeenCalled()
  })

  it('cuerpo que no es objeto o payload sin título → 400', async () => {
    for (const body of ['null', '[]', 'no-json', { payload: { title: '' } }, { payload: { title: 5 } }, {}]) {
      const res = await POST(req(body))
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(deliver).not.toHaveBeenCalled()
  })

  it('con userIds válidos filtra por esos usuarios', async () => {
    const res = await POST(req({ userIds: [UID], payload: PAYLOAD }))
    expect(res.status).toBe(200)
    expect(filtros).toEqual([`in:user_id:${JSON.stringify([UID])}`])
    expect(deliver).toHaveBeenCalledTimes(1)
  })

  it('sin userIds = broadcast solo a usuarios con cuenta', async () => {
    const res = await POST(req({ payload: PAYLOAD }))
    expect(res.status).toBe(200)
    expect(filtros).toEqual(['not:user_id'])
  })

  it('sin userIds e includeAnonymous: true = broadcast que incluye anónimos', async () => {
    const res = await POST(req({ includeAnonymous: true, payload: PAYLOAD }))
    expect(res.status).toBe(200)
    expect(filtros).toEqual([])
  })
})
