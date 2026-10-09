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

function chain(result: () => { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'in', 'update', 'insert']) obj[m] = vi.fn().mockReturnValue(obj)
  obj.single = vi.fn(async () => result())
  obj.maybeSingle = vi.fn(async () => result())
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(result()).then(resolve)
  return obj
}

const tablas: Record<string, () => { data: unknown; error: unknown }> = {
  tournaments: () => ({ data: { organizer_id: ORG_A, status: 'in_progress' }, error: null }),
  rounds: () =>
    rondaLookupError
      ? { data: null, error: rondaLookupError }
      : {
          data: {
            tournament_id: torneoDeLaRonda,
            player_id: 'player-1',
            players: { pending_user_id: GUEST, user_id: 'otro-usuario', status: 'active' },
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
vi.mock('@/lib/guest-token', () => ({ verifyGuestToken: () => true }))

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
    torneoDeLaRonda = null
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

  it('invitado: su tarjeta de B declarando el torneo A → 404', async () => {
    torneoDeLaRonda = TORNEO_B
    const res = await POST(
      req({ ...score, tournament_id: TORNEO_A }, { 'x-guest-id': GUEST, 'x-guest-token': 't' }),
    )
    expect(res.status).toBe(404)
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
