/**
 * POST /api/push/round-update — orden de las comprobaciones y señal de
 * reintento (review #449 M1 / M2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({}) }))

const loadRoundAccess = vi.fn()
const loadRoundForPush = vi.fn()
vi.mock('@/lib/push/round-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/push/round-snapshot')>()),
  loadRoundAccess: (...a: unknown[]) => loadRoundAccess(...a),
  loadRoundForPush: (...a: unknown[]) => loadRoundForPush(...a),
}))

const pushRoundUpdate = vi.fn()
vi.mock('@/lib/push/round-update', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/push/round-update')>()),
  pushRoundUpdate: (...a: unknown[]) => pushRoundUpdate(...a),
}))

const checkRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
}))

import { POST } from './route'

const CODIGO = 'ABC123'
const SCORER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const JUGADOR_ID = '33333333-3333-4333-8333-333333333333'

const ACCESS = {
  estado: 'en_curso',
  participants: { creadorId: SCORER, adminUserId: null, playerUserIds: [], playerIds: [JUGADOR_ID] },
}
const SNAPSHOT = { ...ACCESS, codigo: CODIGO, courseName: 'Los Leones', holes: 18, players: [] }

function post(body: unknown, ip = '10.0.0.1') {
  return POST(new NextRequest('http://localhost/api/push/round-update', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  }))
}

const roundBucketCalls = () => checkRateLimit.mock.calls.filter(([key]) => String(key).startsWith('push-round-codigo:'))

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 })
  loadRoundAccess.mockResolvedValue(ACCESS)
  loadRoundForPush.mockResolvedValue(SNAPSHOT)
  pushRoundUpdate.mockResolvedValue({ status: 'sent', sent: 1, failed: 0, transientFailed: 0, cleaned: 0, finished: false })
})

describe('presupuesto por ronda — sólo lo gasta quien participa (M2)', () => {
  it('un usuario que NO participa recibe 403 sin consumir el bucket de la ronda ni cargar el snapshot', async () => {
    getUser.mockResolvedValue({ data: { user: { id: STRANGER } } })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(403)
    expect(roundBucketCalls()).toHaveLength(0)
    expect(loadRoundForPush).not.toHaveBeenCalled()
    expect(pushRoundUpdate).not.toHaveBeenCalled()
  })

  it('un jugadorId inventado sin sesión recibe 403 sin consumir el bucket de la ronda', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await post({ codigo: CODIGO, jugadorId: STRANGER })
    expect(res.status).toBe(403)
    expect(roundBucketCalls()).toHaveLength(0)
  })

  it('el creador consume el bucket de la ronda y empuja', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(200)
    expect(roundBucketCalls()).toEqual([[`push-round-codigo:${CODIGO}`, 12, 60_000]])
    expect(loadRoundForPush).toHaveBeenCalledTimes(1)
    expect(pushRoundUpdate).toHaveBeenCalledTimes(1)
  })

  it('el invitado con su jugadorId real también', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await post({ codigo: CODIGO, jugadorId: JUGADOR_ID })
    expect(res.status).toBe(200)
    expect(roundBucketCalls()).toHaveLength(1)
  })

  it('con el bucket de la ronda agotado, el participante recibe 429 antes del snapshot', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    checkRateLimit.mockImplementation((key: string) => ({ allowed: !key.startsWith('push-round-codigo:'), remaining: 0, resetAt: Date.now() + 1000 }))
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(429)
    expect(loadRoundForPush).not.toHaveBeenCalled()
  })

  it('una ronda finalizada no pasa por el bucket de la ronda', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    loadRoundAccess.mockResolvedValue({ ...ACCESS, estado: 'finalizada' })
    pushRoundUpdate.mockResolvedValue({ status: 'sent', sent: 1, failed: 0, transientFailed: 0, cleaned: 0, finished: true })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(200)
    expect(roundBucketCalls()).toHaveLength(0)
  })
})

describe('resultado final con fallos transitorios → 502 para que el cliente reintente (M1)', () => {
  it('finished && fallo transitorio → 502 con los conteos', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    pushRoundUpdate.mockResolvedValue({ status: 'sent', sent: 2, failed: 1, transientFailed: 1, cleaned: 0, finished: true })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(502)
    await expect(res.json()).resolves.toMatchObject({ sent: 2, failed: 1, transientFailed: 1, finished: true })
  })

  it('finished con SÓLO suscripciones muertas (410, ya borradas) → 200: reintentar no alcanza a nadie (review 5, I-2)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    pushRoundUpdate.mockResolvedValue({ status: 'sent', sent: 2, failed: 1, transientFailed: 0, cleaned: 1, finished: true })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ failed: 1, transientFailed: 0, cleaned: 1, finished: true })
  })

  it('en curso con fallos → 200 (el próximo guardado trae el estado nuevo)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    pushRoundUpdate.mockResolvedValue({ status: 'sent', sent: 2, failed: 1, transientFailed: 1, cleaned: 0, finished: false })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(200)
  })

  it('finalizada entregada a todos → 200', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    pushRoundUpdate.mockResolvedValue({ status: 'sent', sent: 3, failed: 0, transientFailed: 0, cleaned: 1, finished: true })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(200)
  })
})

describe('entradas', () => {
  it('sin sesión ni jugadorId → 401 sin leer la ronda', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(401)
    expect(loadRoundAccess).not.toHaveBeenCalled()
  })

  it('ronda inexistente → 404', async () => {
    getUser.mockResolvedValue({ data: { user: { id: SCORER } } })
    loadRoundAccess.mockResolvedValue(null)
    const res = await post({ codigo: CODIGO })
    expect(res.status).toBe(404)
    expect(roundBucketCalls()).toHaveLength(0)
  })
})
