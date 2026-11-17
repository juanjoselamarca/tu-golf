// "Buscar mi tarjeta": quién puede pedir que el servidor asegure la tarjeta de la ronda vigente,
// y que el deploy previo a aplicar la migración (función SQL inexistente) no rompa el scorer.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/guest-token', () => ({
  verifyGuestToken: (id: string, tok: string) => !!id && tok === `tok-${id}`,
}))
const rateKeys: string[] = []
let rateAllowed = true
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (key: string) => {
    rateKeys.push(key)
    return { allowed: rateAllowed }
  },
  rateLimitHeaders: () => ({}),
}))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

let authUser: { id: string } | null
let authError: unknown
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authUser }, error: authError }) } }),
}))

const TORNEO = 't1'
const ORGANIZADOR = 'org-1'
const DUENO = 'user-dueno'
const PLAYER = '11111111-1111-4111-8111-111111111111'
const GUEST = '22222222-2222-4222-8222-222222222222'

let torneo: { id: string; organizer_id: string } | null
let jugador: { id?: string; user_id: string | null } | null
let invitadoDe: string | null
let rpcResult: { data: unknown; error: unknown }
let fallaLectura: unknown
const rpcCalls: Array<{ fn: string; args: unknown }> = []

function builder(table: string) {
  const filtros: Record<string, unknown> = {}
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filtros[col] = val
      return b
    },
    maybeSingle: async () => {
      if (fallaLectura) return { data: null, error: fallaLectura }
      if (table === 'tournaments') return { data: torneo, error: null }
      if ('pending_user_id' in filtros) {
        return { data: filtros.pending_user_id === GUEST && invitadoDe ? { id: invitadoDe } : null, error: null }
      }
      return { data: filtros.id === PLAYER ? jugador : null, error: null }
    },
  }
  return b
}
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return rpcResult
    },
  }),
}))

import { POST } from './route'

const params = { params: Promise.resolve({ slug: 'copa' }) }
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest('https://golfersplus.vercel.app/api/torneos/copa/tarjeta', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const guestHeaders = (token = `tok-${GUEST}`) => ({ 'x-guest-id': GUEST, 'x-guest-token': token })
const okRpc = (creada: boolean) => ({ data: { ok: true, round_id: 'r9', round_number: 2, creada }, error: null })

beforeEach(() => {
  authUser = null
  authError = null
  torneo = { id: TORNEO, organizer_id: ORGANIZADOR }
  jugador = { user_id: DUENO }
  invitadoDe = null
  rpcResult = okRpc(true)
  fallaLectura = null
  rateAllowed = true
  rpcCalls.length = 0
  rateKeys.length = 0
  captureError.mockClear()
})

describe('POST /api/torneos/[slug]/tarjeta — autorización', () => {
  it('el propio jugador (players.user_id = sesión) → asegura su tarjeta en ESE torneo', async () => {
    authUser = { id: DUENO }
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, round_id: 'r9', round_number: 2, creada: true })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(rpcCalls).toEqual([{ fn: 'asegurar_tarjeta_vigente', args: { p_tournament_id: TORNEO, p_player_id: PLAYER } }])
    expect(rateKeys).toEqual([`tarjeta:u:${DUENO}`])
  })

  it('el organizador del torneo → puede pedirla para cualquier jugador', async () => {
    authUser = { id: ORGANIZADOR }
    jugador = { user_id: null }
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(200)
    expect(rpcCalls).toHaveLength(1)
  })

  it('el invitado dueño del jugador (mismo cruce por jugador que /guest-player) → 200 sin sesión', async () => {
    invitadoDe = PLAYER
    const res = await POST(req({ player_id: PLAYER }, guestHeaders()), params)
    expect(res.status).toBe(200)
    expect(rpcCalls).toHaveLength(1)
    expect(rateKeys).toEqual([`tarjeta:g:${GUEST}`])
  })

  it('otro usuario con sesión → 403 card_not_yours y no llama a la función', async () => {
    authUser = { id: 'intruso' }
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('card_not_yours')
    expect(rpcCalls).toEqual([])
  })

  it('jugador inexistente o de otro torneo → el mismo 403 (sin oráculo de ids)', async () => {
    authUser = { id: DUENO }
    jugador = null
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('card_not_yours')
  })

  it('invitado de OTRO jugador sin sesión → 403 guest_not_owner', async () => {
    invitadoDe = '33333333-3333-4333-8333-333333333333'
    const res = await POST(req({ player_id: PLAYER }, guestHeaders()), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('guest_not_owner')
    expect(rpcCalls).toEqual([])
  })

  it('token de invitado roto sin sesión → 403 guest_token_invalid', async () => {
    const res = await POST(req({ player_id: PLAYER }, guestHeaders('tok-otro')), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('guest_token_invalid')
  })

  it('guestId viejo de otro jugador en un teléfono con la cuenta del dueño → pasa por la sesión', async () => {
    authUser = { id: DUENO }
    invitadoDe = null
    const res = await POST(req({ player_id: PLAYER }, guestHeaders()), params)
    expect(res.status).toBe(200)
  })

  it('sin sesión ni invitado → 401', async () => {
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(401)
    expect(rpcCalls).toEqual([])
  })

  it('Auth caído no es "sin sesión" → 503 (el scorer dice "Sin conexión", no "inicia sesión")', async () => {
    authError = { name: 'AuthRetryableFetchError', status: 0 }
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(503)
  })

  it('body malo → 400 sin tocar la base', async () => {
    authUser = { id: DUENO }
    expect((await POST(req('no-json'), params)).status).toBe(400)
    expect((await POST(req({ player_id: 'abc' }), params)).status).toBe(400)
    expect(rpcCalls).toEqual([])
  })

  it('rate limit → 429', async () => {
    authUser = { id: DUENO }
    rateAllowed = false
    expect((await POST(req({ player_id: PLAYER }), params)).status).toBe(429)
    expect(rpcCalls).toEqual([])
  })
})

describe('POST /api/torneos/[slug]/tarjeta — resultado', () => {
  beforeEach(() => {
    authUser = { id: DUENO }
  })

  it('idempotente: con la tarjeta ya creada responde 200 creada:false (no crea otra)', async () => {
    rpcResult = okRpc(false)
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(200)
    expect((await res.json()).creada).toBe(false)
  })

  it('la función se niega (torneo cerrado) → 409 con el motivo', async () => {
    rpcResult = { data: { ok: false, reason: 'tournament_closed' }, error: null }
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, reason: 'tournament_closed' })
  })

  it('torneo inexistente → 404', async () => {
    torneo = null
    expect((await POST(req({ player_id: PLAYER }), params)).status).toBe(404)
  })

  it.each([['PGRST202'], ['42883']])(
    'la función aún no existe en prod (%s, deploy antes de la migración) → 503 sin_soporte, sin reportar error',
    async (code) => {
      rpcResult = { data: null, error: { code, message: 'function does not exist' } }
      const res = await POST(req({ player_id: PLAYER }), params)
      expect(res.status).toBe(503)
      expect((await res.json()).code).toBe('sin_soporte')
      expect(captureError).not.toHaveBeenCalled()
    },
  )

  it('la base falla → 503 reintentable y queda reportado', async () => {
    rpcResult = { data: null, error: { code: '57014', message: 'timeout' } }
    const res = await POST(req({ player_id: PLAYER }), params)
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBeUndefined()
    expect(captureError).toHaveBeenCalledTimes(1)
  })

  it('la lectura del torneo falla → 503', async () => {
    fallaLectura = { code: '08006', message: 'conexión' }
    expect((await POST(req({ player_id: PLAYER }), params)).status).toBe(503)
  })
})
