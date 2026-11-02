// El scorer del invitado ubica su tarjeta acá, probando con su token que el guestId es
// suyo (ya no la busca por players.pending_user_id en el roster: esa columna era la
// credencial del invitado y la leía cualquiera con la anon key — 16-oct-2026).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/guest-token', () => ({
  verifyGuestToken: (id: string, tok: string) => !!id && tok === `tok-${id}`,
}))
const rateKeys: string[] = []
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (key: string) => {
    rateKeys.push(key)
    return { allowed: true }
  },
  rateLimitHeaders: () => ({}),
}))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

type Filtro = [string, unknown]
let torneo: { id: string } | null
let jugador: { id: string } | null
let falla: unknown
const consultas: Array<{ table: string; filtros: Filtro[] }> = []
function builder(table: string) {
  const filtros: Filtro[] = []
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filtros.push([col, val])
      return b
    },
    maybeSingle: async () => {
      consultas.push({ table, filtros: [...filtros] })
      if (falla) return { data: null, error: falla }
      return { data: table === 'tournaments' ? torneo : jugador, error: null }
    },
  }
  return b
}
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

import { GET } from '../route'

const GUEST = '22222222-2222-4222-8222-222222222222'
const params = { params: Promise.resolve({ slug: 'copa' }) }
const req = (headers: Record<string, string>) =>
  new NextRequest('https://golfersplus.vercel.app/api/torneos/copa/guest-player', { headers })

beforeEach(() => {
  torneo = { id: 't1' }
  jugador = { id: 'p1' }
  falla = null
  consultas.length = 0
  rateKeys.length = 0
  captureError.mockClear()
})

describe('GET /api/torneos/[slug]/guest-player', () => {
  it('token válido → el jugador cuyo pending_user_id es el guestId, en ESE torneo; privado', async () => {
    const res = await GET(req({ 'x-guest-id': GUEST, 'x-guest-token': `tok-${GUEST}` }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ playerId: 'p1' })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(consultas).toEqual([
      { table: 'tournaments', filtros: [['slug', 'copa']] },
      { table: 'players', filtros: [['tournament_id', 't1'], ['pending_user_id', GUEST]] },
    ])
  })

  it('sin token o con uno ajeno → 403 y no consulta la BD', async () => {
    const sinToken: Record<string, string>[] = [{ 'x-guest-id': GUEST }, { 'x-guest-id': GUEST, 'x-guest-token': 'tok-otro' }, {}]
    for (const h of sinToken) {
      expect((await GET(req(h), params)).status).toBe(403)
    }
    expect(consultas).toEqual([])
  })

  it('el límite es por invitado, no por IP (en la salida todos comparten el wifi del club)', async () => {
    await GET(req({ 'x-guest-id': GUEST, 'x-guest-token': `tok-${GUEST}` }), params)
    await GET(req({ 'x-guest-id': GUEST }), params)
    expect(rateKeys).toEqual([`guest-player:${GUEST}`])
  })

  it('no inscrito o torneo inexistente → 404', async () => {
    const h = { 'x-guest-id': GUEST, 'x-guest-token': `tok-${GUEST}` }
    jugador = null
    expect((await GET(req(h), params)).status).toBe(404)
    torneo = null
    expect((await GET(req(h), params)).status).toBe(404)
  })

  it('la BD falla → 503 (no un 404 que el scorer leería como "no inscrito") y se reporta', async () => {
    falla = new Error('timeout')
    const res = await GET(req({ 'x-guest-id': GUEST, 'x-guest-token': `tok-${GUEST}` }), params)
    expect(res.status).toBe(503)
    expect(captureError).toHaveBeenCalledTimes(1)
  })
})
