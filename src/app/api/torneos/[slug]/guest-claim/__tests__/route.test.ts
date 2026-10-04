// El reclamo legítimo que SIGUE vivo: el invitado de un TORNEO que crea cuenta
// reclama su jugador con el `guestId` de su propio dispositivo
// (`players.pending_user_id`), nunca por nombre. Fija que apagar el reclamo de
// ronda libre por nombre (02-oct-2026) no lo tocó.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitHeaders: () => ({}),
}))

// Admin client fake: respuestas por tabla + registro de filtros y updates.
type Filtro = [string, unknown]
const updates: Array<{ table: string; values: Record<string, unknown>; filtros: Filtro[] }> = []
let tournament: { id: string } | null
let guestPlayer: { id: string; player_name: string | null; user_id: string | null } | null
let existingPlayer: { id: string } | null
let profile: { name: string | null } | null
const playerLookups: Filtro[][] = []

function builder(table: string) {
  const filtros: Filtro[] = []
  let update: Record<string, unknown> | null = null
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filtros.push([col, val])
      return b
    },
    update: (values: Record<string, unknown>) => {
      update = values
      return b
    },
    maybeSingle: async () => {
      if (table === 'tournaments') return { data: tournament }
      if (table === 'profiles') return { data: profile }
      if (table === 'players') {
        playerLookups.push([...filtros])
        const porGuest = filtros.some(([c]) => c === 'pending_user_id')
        return { data: porGuest ? guestPlayer : existingPlayer }
      }
      return { data: null }
    },
    then: (resolve: (v: { error: null }) => void) => {
      if (update) updates.push({ table, values: update, filtros: [...filtros] })
      resolve({ error: null })
    },
  }
  return b
}
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { POST } from '../route'

const USER = '11111111-1111-4111-8111-111111111111'
const GUEST = '22222222-2222-4222-8222-222222222222'

function req(body: unknown) {
  return new NextRequest('https://golfersplus.vercel.app/api/torneos/copa/guest-claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = { params: Promise.resolve({ slug: 'copa' }) }

beforeEach(() => {
  updates.length = 0
  playerLookups.length = 0
  getUser.mockResolvedValue({ data: { user: { id: USER } } })
  tournament = { id: 't1' }
  guestPlayer = { id: 'p1', player_name: 'Juan Pérez', user_id: null }
  existingPlayer = null
  profile = { name: null }
})

describe('POST /api/torneos/[slug]/guest-claim (reclamo por guestId, no por nombre)', () => {
  it('vincula el jugador cuyo pending_user_id es el guestId y limpia el pending', async () => {
    const res = await POST(req({ guestId: GUEST }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, playerId: 'p1' })
    // Se buscó por guestId del dispositivo, nunca por nombre.
    expect(playerLookups[0]).toEqual([['tournament_id', 't1'], ['pending_user_id', GUEST]])
    expect(playerLookups.flat().some(([c]) => c === 'player_name')).toBe(false)
    expect(updates).toContainEqual({
      table: 'players',
      values: { user_id: USER, pending_user_id: null },
      filtros: [['id', 'p1']],
    })
  })

  it('409 si ese jugador ya tiene dueño', async () => {
    guestPlayer = { id: 'p1', player_name: 'Juan Pérez', user_id: 'otro' }
    const res = await POST(req({ guestId: GUEST }), params)
    expect(res.status).toBe(409)
    expect(updates).toEqual([])
  })

  it('404 si el guestId no corresponde a ningún invitado del torneo', async () => {
    guestPlayer = null
    const res = await POST(req({ guestId: GUEST }), params)
    expect(res.status).toBe(404)
    expect(updates).toEqual([])
  })

  it('401 sin sesión y 400 con guestId inválido', async () => {
    expect((await POST(req({ guestId: 'no-uuid' }), params)).status).toBe(400)
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(req({ guestId: GUEST }), params)).status).toBe(401)
  })
})
