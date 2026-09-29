/**
 * Tests de /api/push/round-update — el push sale de la BD, no del body; sólo lo
 * dispara quien anota en la ronda (con sesión o, sin cuenta, con su jugadorId);
 * el resultado final ni se pierde detrás del límite por ronda ni deja watchers;
 * 410 limpia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { RoundPushSnapshot } from '@/lib/push/round-snapshot'

const getUserMock = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}))
const snapshot = { value: null as RoundPushSnapshot | null }
// El admin client sólo se usa para la lectura barata de `estado` (límite por ronda antes del snapshot).
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: snapshot.value ? { estado: snapshot.value.estado } : null }) }) }) }),
  })),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

vi.mock('@/lib/push/round-snapshot', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/push/round-snapshot')>()
  return { ...real, loadRoundForPush: vi.fn(async () => snapshot.value) }
})
vi.mock('@/lib/push/watchers', () => ({
  resolveWatcherSubscriptions: vi.fn(async () => []),
  removeWatchersReached: vi.fn(async () => {}),
}))
vi.mock('@/lib/push/subscriptions', () => ({ deleteStaleSubscriptions: vi.fn(async () => {}) }))
const sendMock = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/push/deliver', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/push/deliver')>()
  return { ...real, sendWebPush: (...args: unknown[]) => sendMock(...(args as [])) }
})

import { POST } from '@/app/api/push/round-update/route'
import { resolveWatcherSubscriptions, removeWatchersReached } from '@/lib/push/watchers'
import { deleteStaleSubscriptions } from '@/lib/push/subscriptions'

const GUEST_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

const BASE: RoundPushSnapshot = {
  codigo: '4YDC3G', courseName: 'Club de Golf Los Leones', holes: 9, estado: 'en_curso',
  players: [{ nombre: 'Juan José Lamarca', vsPar: 4, holesCompleted: 3, totalHoles: 9 }],
  participants: { creadorId: 'u-creador', adminUserId: 'u-admin', playerUserIds: ['u-jugador'], playerIds: [GUEST_ID] },
}
const SUBS = [
  { endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'k', auth: 'a' },
  { endpoint: 'https://fcm.googleapis.com/fcm/send/dead', p256dh: 'k', auth: 'a' },
]

let n = 0
let ip = 0
function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/push/round-update', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${++ip % 250}` },
  })
}
/** Código distinto por test: el rate limit por ronda es global en memoria. */
const codigo = () => `R${++n}`

beforeEach(() => {
  vi.clearAllMocks()
  snapshot.value = { ...BASE }
  getUserMock.mockResolvedValue({ data: { user: { id: 'u-jugador' } } })
  vi.mocked(resolveWatcherSubscriptions).mockResolvedValue(SUBS)
})

describe('POST /api/push/round-update — quién puede', () => {
  it('401 sin sesión y sin jugadorId', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ codigo: codigo() }))).status).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('403 si el usuario no participa en la ronda (review I2)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-ajeno' } } })
    expect((await POST(req({ codigo: codigo() }))).status).toBe(403)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('creador, admin de grupo y jugador con cuenta SÍ pueden', async () => {
    for (const id of ['u-creador', 'u-admin', 'u-jugador']) {
      getUserMock.mockResolvedValue({ data: { user: { id } } })
      expect((await POST(req({ codigo: codigo() }))).status).toBe(200)
    }
  })

  it('invitado sin cuenta: con el jugadorId de SU fila → 200 (review I-A)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ codigo: codigo(), jugadorId: GUEST_ID }))
    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('invitado con un jugadorId que no es de la ronda → 403; jugadorId malformado → 400', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ codigo: codigo(), jugadorId: OTHER_ID }))).status).toBe(403)
    expect((await POST(req({ codigo: codigo(), jugadorId: 'no-uuid' }))).status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('404 si la ronda no existe; 400 sin código', async () => {
    snapshot.value = null
    expect((await POST(req({ codigo: codigo() }))).status).toBe(404)
    expect((await POST(req({}))).status).toBe(400)
  })
})

describe('POST /api/push/round-update — contenido y limpieza', () => {
  it('el payload sale de la BD (título Thru 3), no del body; con TTL corto y topic = código', async () => {
    const c = codigo()
    const res = await POST(req({ codigo: c, players: [{ nombre: 'Falso', vsPar: -20, holesCompleted: 18 }], maxHole: 18 }))
    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalledTimes(2)
    const [, payload, opts] = sendMock.mock.calls[0] as unknown as [unknown, string, { ttlSeconds: number; topic?: string }]
    const parsed = JSON.parse(payload)
    expect(parsed.title).toBe('Club de Golf Los Leones · Thru 3')
    expect(parsed.body).toBe('Lamarca +4')
    expect(parsed.tag).toBe('golfers-spectator-4YDC3G')
    expect(parsed.finished).toBe(false)
    expect(opts).toEqual({ ttlSeconds: 600, topic: c })
    expect(removeWatchersReached).not.toHaveBeenCalled()
  })

  it('410 Gone borra esa suscripción (cascada → watcher)', async () => {
    sendMock.mockImplementation(async (sub: unknown) => {
      if ((sub as { endpoint: string }).endpoint.endsWith('/dead')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
    })
    const res = await POST(req({ codigo: codigo() }))
    expect(await res.json()).toMatchObject({ sent: 1, failed: 1, cleaned: 1 })
    expect(deleteStaleSubscriptions).toHaveBeenCalledWith(expect.anything(), ['https://fcm.googleapis.com/fcm/send/dead'])
  })

  it('ronda finalizada → "Resultado final", TTL largo, y limpia los watchers', async () => {
    snapshot.value = { ...BASE, estado: 'finalizada', players: [{ ...BASE.players[0], holesCompleted: 9 }] }
    const c = codigo()
    const res = await POST(req({ codigo: c }))
    expect(await res.json()).toMatchObject({ finished: true })
    const [, payload, opts] = sendMock.mock.calls[0] as unknown as [unknown, string, { ttlSeconds: number }]
    expect(JSON.parse(payload).title).toBe('Resultado final · Club de Golf Los Leones')
    expect(opts.ttlSeconds).toBe(86400)
    // Sólo se retiran los watchers que RECIBIERON el resultado (o muertos): acá los dos.
    expect(removeWatchersReached).toHaveBeenCalledWith(expect.anything(), c, SUBS.map(s => s.endpoint))
  })

  it('resultado final con un fallo transitorio: ese watcher queda para el reintento', async () => {
    snapshot.value = { ...BASE, estado: 'finalizada' }
    sendMock.mockImplementation(async (sub: unknown) => {
      if ((sub as { endpoint: string }).endpoint.endsWith('/dead')) throw Object.assign(new Error('boom'), { statusCode: 500 })
    })
    await POST(req({ codigo: codigo() }))
    expect(removeWatchersReached).toHaveBeenCalledWith(expect.anything(), expect.any(String), ['https://fcm.googleapis.com/fcm/send/a'])
  })

  it('el "Resultado final" NO queda detrás del límite por ronda (review I-B)', async () => {
    const c = codigo()
    // Agotar el límite por ronda (12/min) con guardados de una ronda en curso.
    for (let i = 0; i < 12; i++) expect((await POST(req({ codigo: c }))).status).toBe(200)
    expect((await POST(req({ codigo: c }))).status).toBe(429)
    // La misma ronda, ya finalizada: pasa igual.
    snapshot.value = { ...BASE, estado: 'finalizada' }
    const res = await POST(req({ codigo: c }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ finished: true })
  })

  it('sin seguidores no envía nada', async () => {
    vi.mocked(resolveWatcherSubscriptions).mockResolvedValue([])
    const res = await POST(req({ codigo: codigo() }))
    expect(await res.json()).toMatchObject({ sent: 0 })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
