import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// /api/game autoriza contra el `tournament_id` del body y escribe sobre el
// `round_id` del body. Estos tests fijan que la tarjeta tiene que ser de ESE
// torneo: el organizador de A no puede cargar golpes ni cerrar tarjetas de B.

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const TORNEO_A = 'aaaaaaaa-1111-4111-8111-111111111111'
const TORNEO_B = 'bbbbbbbb-1111-4111-8111-111111111111'
const RONDA = 'cccccccc-2222-4222-8222-222222222222'
const GUEST = 'dddddddd-3333-4333-8333-333333333333'

// Torneo al que pertenece RONDA en la base simulada (lo cambia cada test).
let torneoDeLaRonda: string | null = TORNEO_A
let rondaLookupError: unknown = null
let rondaNoExiste = false
// Sólo la lectura del estado del jugador (`players(status)`) falla / devuelve este estado.
let estadoLookupError: unknown = null
let estadoJugador = 'active'
let tokenValido = true
let pendienteDe = GUEST

function chain(result: (sel: string) => { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  let sel = ''
  for (const m of ['eq', 'not', 'in', 'update', 'insert']) obj[m] = vi.fn().mockReturnValue(obj)
  obj.select = vi.fn((s?: string) => { sel = s ?? ''; return obj })
  obj.single = vi.fn(async () => result(sel))
  obj.maybeSingle = vi.fn(async () => result(sel))
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(result(sel)).then(resolve)
  return obj
}

const tablas: Record<string, (sel: string) => { data: unknown; error: unknown }> = {
  tournaments: () => ({ data: { organizer_id: ORG_A, status: 'in_progress' }, error: null }),
  rounds: (sel) =>
    estadoLookupError && sel.includes('players(status)')
      ? { data: null, error: estadoLookupError }
      : rondaLookupError
      ? { data: null, error: rondaLookupError }
      : rondaNoExiste
      ? { data: null, error: null }
      : {
          data: {
            tournament_id: torneoDeLaRonda,
            player_id: 'player-1',
            players: { pending_user_id: pendienteDe, user_id: 'otro-usuario', status: estadoJugador },
          },
          error: null,
        },
  hole_scores: () => ({ data: null, error: null }),
}
const from = (t: string) => chain(tablas[t] ?? (() => ({ data: null, error: null })))

const mockGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser }, from }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from }) }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/guest-token', () => ({ verifyGuestToken: () => tokenValido }))

const ok = () => NextResponse.json({ success: true })
const upsertScore = vi.fn(async () => ok())
const finalizeRound = vi.fn(async () => ok())
vi.mock('./actions', () => ({
  upsertScore: (...a: unknown[]) => (upsertScore as (...x: unknown[]) => unknown)(...a),
  finalizeRound: (...a: unknown[]) => (finalizeRound as (...x: unknown[]) => unknown)(...a),
  startNextRound: vi.fn(),
  cancelTournament: vi.fn(),
  withdrawPlayer: vi.fn(),
  disqualifyPlayer: vi.fn(),
  openInscriptions: vi.fn(),
  revertInscriptions: vi.fn(),
  closeTournamentAction: vi.fn(),
  reopenTournamentAction: vi.fn(),
}))

import { POST } from './route'

let n = 0
function req(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  // round_id distinto por request no hace falta: el rate limit es 120/min.
  n++
  return new NextRequest('http://test/api/game', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${n}`, ...headers },
  })
}

const score = { action: 'upsert_score', round_id: RONDA, hole_number: 3, par: 4, gross_score: 5 }

beforeEach(() => {
  torneoDeLaRonda = TORNEO_A
  rondaLookupError = null
  rondaNoExiste = false
  estadoLookupError = null
  estadoJugador = 'active'
  tokenValido = true
  pendienteDe = GUEST
  upsertScore.mockClear()
  finalizeRound.mockClear()
  mockGetUser.mockResolvedValue({ data: { user: { id: ORG_A } } })
})

describe('/api/game — la tarjeta tiene que ser del torneo autorizado', () => {
  it('organizador de A carga golpes en una tarjeta de A → pasa', async () => {
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(200)
    expect(upsertScore).toHaveBeenCalledTimes(1)
  })

  it('organizador de A NO puede cargar golpes en una tarjeta de B', async () => {
    torneoDeLaRonda = TORNEO_B
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('round_not_in_tournament')
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('organizador de A NO puede cerrar una tarjeta de B', async () => {
    torneoDeLaRonda = TORNEO_B
    const res = await POST(req({ action: 'finalize_round', round_id: RONDA, tournament_id: TORNEO_A }))
    expect(res.status).toBe(404)
    expect(finalizeRound).not.toHaveBeenCalled()
  })

  it('organizador de A cierra una tarjeta de A → pasa', async () => {
    const res = await POST(req({ action: 'finalize_round', round_id: RONDA, tournament_id: TORNEO_A }))
    expect(res.status).toBe(200)
    expect(finalizeRound).toHaveBeenCalledTimes(1)
  })

  it('tarjeta inexistente → 404, no escribe', async () => {
    rondaNoExiste = true
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(404)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('round_id que no es UUID en finalize_round → 400', async () => {
    const res = await POST(req({ action: 'finalize_round', round_id: 'x', tournament_id: TORNEO_A }))
    expect(res.status).toBe(400)
    expect(finalizeRound).not.toHaveBeenCalled()
  })

  it('si la consulta falla → 503 (el scorer reintenta), no escribe', async () => {
    rondaLookupError = new Error('timeout')
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(503)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('cerrar tarjeta con la consulta caída → 503, no cierra', async () => {
    rondaLookupError = new Error('timeout')
    const res = await POST(req({ action: 'finalize_round', round_id: RONDA, tournament_id: TORNEO_A }))
    expect(res.status).toBe(503)
    expect(finalizeRound).not.toHaveBeenCalled()
  })

  it('jugador de una tarjeta de B declarando el torneo A (activo) → 404, no escribe', async () => {
    // 'otro-usuario' es el players.user_id de RONDA en la base simulada: pasa la autorización de jugador.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro-usuario' } } })
    torneoDeLaRonda = TORNEO_B
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(404)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('jugador de su tarjeta en su torneo → pasa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro-usuario' } } })
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(200)
    expect(upsertScore).toHaveBeenCalledTimes(1)
  })

  it('un usuario ajeno a los dos torneos recibe 403 exista o no la tarjeta (sin oráculo)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'intruso' } } })
    torneoDeLaRonda = TORNEO_B
    const ajena = await POST(req({ ...score, tournament_id: TORNEO_A }))
    rondaNoExiste = true
    const inexistente = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect([ajena.status, inexistente.status]).toEqual([403, 403])
  })

  it('invitado: su tarjeta de B declarando el torneo A → 403', async () => {
    torneoDeLaRonda = TORNEO_B
    const res = await POST(
      req({ ...score, tournament_id: TORNEO_A }, { 'x-guest-id': GUEST, 'x-guest-token': 't' }),
    )
    expect(res.status).toBe(403)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('invitado: su tarjeta en su torneo → pasa', async () => {
    const res = await POST(
      req({ ...score, tournament_id: TORNEO_A }, { 'x-guest-id': GUEST, 'x-guest-token': 't' }),
    )
    expect(res.status).toBe(200)
    expect(upsertScore).toHaveBeenCalledTimes(1)
  })
})

// PR #754: el scorer del torneo deja de reintentar ante 401/403 (lo lee como "sin sesión" / "sin
// permiso"). Una falla pasajera de Auth o de la base NO puede salir como 401/403: tiene que ser 503.
describe('/api/game — falla pasajera no se disfraza de 401/403', () => {
  it('Auth caído (AuthRetryableFetchError) → 503, no 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } })
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(503)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('Auth responde 5xx → 503', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', status: 502 } })
    expect((await POST(req({ ...score, tournament_id: TORNEO_A }))).status).toBe(503)
  })

  it('getUser lanza → 503', async () => {
    mockGetUser.mockRejectedValue(new Error('fetch failed'))
    expect((await POST(req({ ...score, tournament_id: TORNEO_A }))).status).toBe(503)
  })

  it('sin sesión de verdad (AuthSessionMissingError) → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } })
    expect((await POST(req({ ...score, tournament_id: TORNEO_A }))).status).toBe(401)
  })

  it('jugador (no organizador) con la lectura de su tarjeta caída → 503, no 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro-usuario' } } })
    rondaLookupError = new Error('timeout')
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(503)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('invitado con la lectura de su tarjeta caída → 503, no 403', async () => {
    rondaLookupError = new Error('timeout')
    const res = await POST(
      req({ ...score, tournament_id: TORNEO_A }, { 'x-guest-id': GUEST, 'x-guest-token': 't' }),
    )
    expect(res.status).toBe(503)
    expect(upsertScore).not.toHaveBeenCalled()
  })
})

describe('/api/game — códigos de los 403 y round_id malformado (PR #754 vuelta 2)', () => {
  const invitado = { 'x-guest-id': GUEST, 'x-guest-token': 't' }

  it('invitado retirado → 403 player_withdrawn', async () => {
    estadoJugador = 'withdrawn'
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }, invitado))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('player_withdrawn')
  })

  it('jugador con cuenta descalificado → 403 player_withdrawn', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro-usuario' } } })
    estadoJugador = 'disqualified'
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('player_withdrawn')
  })

  it('token de invitado que no verifica → 403 guest_token_invalid, no escribe', async () => {
    tokenValido = false
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }, invitado))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('guest_token_invalid')
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('invitado sano con la tarjeta de otro jugador → 403 guest_not_owner, no escribe', async () => {
    pendienteDe = 'otro-invitado'
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }, invitado))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('guest_not_owner')
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('invitado que no es dueño de la tarjeta → 403 guest_not_owner', async () => {
    torneoDeLaRonda = TORNEO_B
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }, invitado))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('guest_not_owner')
  })

  it('invitado con la lectura de su estado caída → 503, no escribe', async () => {
    estadoLookupError = new Error('timeout')
    const res = await POST(req({ ...score, tournament_id: TORNEO_A }, invitado))
    expect(res.status).toBe(503)
    expect(upsertScore).not.toHaveBeenCalled()
  })

  it('round_id malformado en upsert_score → 400 (no 503 reintentable), con y sin invitado', async () => {
    const malo = { ...score, round_id: 'no-es-uuid', tournament_id: TORNEO_A }
    expect((await POST(req(malo))).status).toBe(400)
    expect((await POST(req(malo, invitado))).status).toBe(400)
    expect(upsertScore).not.toHaveBeenCalled()
  })
})
