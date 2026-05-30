import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks ---

const mockGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: () => {},
  }),
}))

const mockFrom = vi.fn()
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}))

import { PATCH } from './route'

const ORGANIZER_ID = 'user-org-123'
const TOURNAMENT_ID = 'tour-123'
const VALID_TEE_ID = '12345678-1234-4234-9234-123456789abc'

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
  // Default: authenticated user
  mockGetUser.mockResolvedValue({ data: { user: { id: ORGANIZER_ID } } })
})

function makeReq(body: unknown) {
  return new Request('http://test/api/torneos/abc/players/p1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

/** Build a chainable Supabase mock that is also thenable (like real PostgREST builder) */
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {}
  obj.select = vi.fn().mockReturnValue(obj)
  obj.eq = vi.fn().mockReturnValue(obj)
  obj.single = vi.fn().mockResolvedValue(result)
  obj.update = vi.fn().mockReturnValue(obj)
  // Make it thenable so `await supabase.from(...).update(...).eq(...).eq(...)` works
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve)
  return obj
}

/** Set up mockFrom to handle the standard flow: tournament → player → (tee) → update */
function setupMocks(opts: {
  tournament?: { id: string; course_id: string; organizer_id: string } | null
  player?: { id: string } | null
  courseTee?: { course_id: string } | null
  updateError?: { message: string } | null
}) {
  let playerCall = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'tournaments') {
      const data = opts.tournament ?? null
      return chain({ data, error: data ? null : { message: 'not found' } })
    }
    if (table === 'players') {
      playerCall++
      if (playerCall === 1) {
        // player existence check (select)
        const data = opts.player ?? null
        return chain({ data, error: data ? null : { message: 'not found' } })
      }
      // players update — .update().eq().eq() resolves directly
      return chain({ data: null, error: opts.updateError ?? null })
    }
    if (table === 'course_tees') {
      const data = opts.courseTee ?? null
      return chain({ data, error: data ? null : { message: 'not found' } })
    }
    return chain({ data: null, error: null })
  })
}

describe('PATCH /api/torneos/[slug]/players/[playerId]', () => {
  it('401 si no está autenticado', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(401)
    const j = await res.json()
    expect(j.error).toBe('unauthorized')
  })

  it('400 si body no es JSON válido', async () => {
    const req = new Request('http://test/x', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.error).toBe('invalid_json')
  })

  it('400 si tee_id no es UUID', async () => {
    const res = await PATCH(makeReq({ tee_id: 'not-a-uuid' }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(400)
  })

  it('403 si el usuario no es el organizador', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro-user' } } })
    setupMocks({
      tournament: { id: TOURNAMENT_ID, course_id: 'c1', organizer_id: ORGANIZER_ID },
    })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(403)
    const j = await res.json()
    expect(j.error).toBe('forbidden')
  })

  it('404 si tournament no existe', async () => {
    setupMocks({ tournament: null })
    const res = await PATCH(makeReq({ tee_id: VALID_TEE_ID }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(404)
  })

  it('404 si el jugador no pertenece al torneo', async () => {
    setupMocks({
      tournament: { id: TOURNAMENT_ID, course_id: 'c1', organizer_id: ORGANIZER_ID },
      player: null,
    })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(404)
    const j = await res.json()
    expect(j.error).toBe('player_not_in_tournament')
  })

  it('200 con tee_id null (limpia asignación)', async () => {
    setupMocks({
      tournament: { id: TOURNAMENT_ID, course_id: 'c1', organizer_id: ORGANIZER_ID },
      player: { id: 'p1' },
    })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(200)
  })

  it('200 con tee_id válido (mismo course)', async () => {
    setupMocks({
      tournament: { id: TOURNAMENT_ID, course_id: 'course-abc', organizer_id: ORGANIZER_ID },
      player: { id: 'p1' },
      courseTee: { course_id: 'course-abc' },
    })
    const res = await PATCH(makeReq({ tee_id: VALID_TEE_ID }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(200)
  })

  it('409 si tee_id pertenece a otra cancha', async () => {
    setupMocks({
      tournament: { id: TOURNAMENT_ID, course_id: 'course-abc', organizer_id: ORGANIZER_ID },
      player: { id: 'p1' },
      courseTee: { course_id: 'course-OTRA' },
    })
    const res = await PATCH(makeReq({ tee_id: VALID_TEE_ID }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.error).toBe('tee_belongs_to_other_course')
  })

  it('500 si update falla', async () => {
    setupMocks({
      tournament: { id: TOURNAMENT_ID, course_id: 'c1', organizer_id: ORGANIZER_ID },
      player: { id: 'p1' },
      updateError: { message: 'rls denied' },
    })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(500)
  })
})
