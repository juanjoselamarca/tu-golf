// La inscripción del invitado es dos pasos: el RPC crea al jugador con un
// pending_user_id aleatorio y la route lo reescribe con el guestId del dispositivo.
// Si el segundo paso falla, el token no apunta a ningún jugador: se deshace la
// inscripción para que el reintento no deje un duplicado en el leaderboard.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitHeaders: () => ({}),
}))
vi.mock('@/golf/billing/require-feature', () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
}))
vi.mock('@/lib/guest-token', () => ({ signGuestToken: (id: string) => `tok-${id}` }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
const enrollPlayer = vi.fn()
vi.mock('@/lib/data/tournaments/enrollPlayer', () => ({ enrollPlayer: (...a: unknown[]) => enrollPlayer(...a) }))

type Op = { table: string; op: 'update' | 'delete'; values?: Record<string, unknown>; filtros: Array<[string, unknown]> }
const ops: Op[] = []
let linkError: { message: string; code?: string } | null
let undoError: { message: string } | null
// Respuestas sucesivas al lookup de players por guestId (1º: ¿ya inscrito?, 2º: tras un 23505).
let lookups: Array<{ id: string } | null>

function builder(table: string) {
  const filtros: Array<[string, unknown]> = []
  let op: Op | null = null
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => { filtros.push([col, val]); return b },
    update: (values: Record<string, unknown>) => { op = { table, op: 'update', values, filtros }; return b },
    delete: () => { op = { table, op: 'delete', filtros }; return b },
    maybeSingle: async () => {
      if (table === 'tournaments') return { data: { id: 't1', status: 'open', organizer_id: 'o1' } }
      if (table === 'players') return { data: lookups.shift() ?? null }
      return { data: null }
    },
    then: (resolve: (v: { error: unknown }) => void) => {
      if (op) ops.push(op)
      resolve({ error: op?.op === 'update' ? linkError : op?.op === 'delete' ? undoError : null })
    },
  }
  return b
}
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

import { POST } from '../route'

const GUEST = '22222222-2222-4222-8222-222222222222'
const params = { params: Promise.resolve({ slug: 'copa' }) }
const req = () => new NextRequest('https://golfersplus.vercel.app/api/torneos/copa/guest-join', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ guestId: GUEST, name: 'Juan Pérez', handicap: 18 }),
})

beforeEach(() => {
  ops.length = 0
  linkError = null
  undoError = null
  lookups = []
  captureError.mockReset()
  enrollPlayer.mockReset().mockResolvedValue({ ok: true, playerId: 'p-nuevo' })
})

describe('POST /api/torneos/[slug]/guest-join', () => {
  it('vincula el guestId al jugador creado y devuelve el token', async () => {
    const res = await POST(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, playerId: 'p-nuevo', guestToken: `tok-${GUEST}` })
    expect(ops).toEqual([{ table: 'players', op: 'update', values: { pending_user_id: GUEST }, filtros: [['id', 'p-nuevo']] }])
  })

  it('si el vínculo falla, deshace la inscripción y NO entrega token', async () => {
    linkError = { message: 'timeout' }
    const res = await POST(req(), params)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('link_failed')
    expect(body.guestToken).toBeUndefined()
    expect(ops.at(-1)).toEqual({ table: 'players', op: 'delete', filtros: [['id', 'p-nuevo']] })
    expect(captureError).toHaveBeenCalledOnce()
  })

  it('si además falla el DELETE, lo reporta con el playerId (jugador sin vínculo a limpiar)', async () => {
    linkError = { message: 'timeout' }
    undoError = { message: 'timeout' }
    const res = await POST(req(), params)
    expect(res.status).toBe(500)
    expect(captureError).toHaveBeenCalledWith(undoError, expect.objectContaining({
      context: 'guest-join.undo', meta: { playerId: 'p-nuevo', tournamentId: 't1' },
    }))
  })

  it('doble submit (23505): borra su propio jugador y responde con el que ganó la carrera', async () => {
    linkError = { message: 'duplicate key', code: '23505' }
    lookups = [null, { id: 'p-ganador' }]
    const res = await POST(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, playerId: 'p-ganador', guestToken: `tok-${GUEST}`, alreadyRegistered: true })
    expect(ops.at(-1)).toEqual({ table: 'players', op: 'delete', filtros: [['id', 'p-nuevo']] })
    expect(captureError).not.toHaveBeenCalled()
  })

  it('ya inscrito con este guestId: devuelve el token sin volver a inscribir', async () => {
    lookups = [{ id: 'p-viejo' }]
    const res = await POST(req(), params)
    expect(await res.json()).toMatchObject({ ok: true, playerId: 'p-viejo', alreadyRegistered: true })
    expect(enrollPlayer).not.toHaveBeenCalled()
    expect(ops).toEqual([])
  })
})
