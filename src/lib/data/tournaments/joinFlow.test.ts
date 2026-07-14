import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchJoinInfo, registerPlayerAndRound, esInscribible } from './joinFlow'

// Fabrica un SupabaseClient mockeado donde cada `.from(tabla)` devuelve un objeto
// con los metodos chaining que usan fetchJoinInfo y registerPlayerAndRound.
// `tableData` maps tabla → respuesta de .maybeSingle()/.single().
function makeMockClient(tableData: {
  tournaments?: { data: unknown; error?: { message: string; code?: string } | null }
  tournaments_maxplayers?: { data: unknown; error?: null }
  players_count?: number
  profiles?: { data: unknown; error?: null }
  players_select?: { data: unknown; error?: null }
  players_insert?: { data: unknown; error?: { message: string; code?: string } | null }
  rounds_insert?: { error?: { message: string } | null }
  rpc_result?: unknown
  rpc_error?: { message: string } | null
}): SupabaseClient {
  return {
    from: vi.fn((tabla: string) => {
      if (tabla === 'tournaments') {
        const r = tableData.tournaments
        // `.single()` sirve al fetch de max_players en registerPlayerAndRound;
        // `.maybeSingle()` al de fetchJoinInfo. Default sin cupo (max_players null).
        const maxp = tableData.tournaments_maxplayers ?? { data: { max_players: null }, error: null }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(r ?? { data: null, error: null }),
              single: () => Promise.resolve(maxp),
            }),
          }),
        }
      }
      if (tabla === 'profiles') {
        const r = tableData.profiles ?? { data: null, error: null }
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(r) }) }),
        }
      }
      if (tabla === 'players') {
        const sel = tableData.players_select ?? { data: null, error: null }
        const ins = tableData.players_insert ?? { data: null, error: null }
        const cnt = tableData.players_count ?? 0
        return {
          select: () => ({
            // `.eq().eq()` sirve a dos usos: `.maybeSingle()` (dup-check de
            // fetchJoinInfo) y `await` directo (count query del cupo). El objeto
            // es thenable y además expone maybeSingle.
            eq: () => ({
              eq: () => {
                const obj: Record<string, unknown> = {
                  maybeSingle: () => Promise.resolve(sel),
                  count: cnt,
                  error: null,
                }
                obj.then = (resolve: (v: unknown) => unknown) => resolve({ count: cnt, error: null })
                return obj
              },
            }),
          }),
          insert: () => ({ select: () => ({ single: () => Promise.resolve(ins) }) }),
        }
      }
      if (tabla === 'rounds') {
        const r = tableData.rounds_insert ?? { error: null }
        return {
          insert: () => Promise.resolve(r),
        }
      }
      throw new Error('unmocked table: ' + tabla)
    }),
    // Cupo + INSERT players + INSERT rounds viven en el RPC atómico `enroll_player`.
    rpc: vi.fn(() =>
      Promise.resolve({
        data: tableData.rpc_result ?? { ok: true, player_id: 'p1' },
        error: tableData.rpc_error ?? null,
      })
    ),
  } as unknown as SupabaseClient
}

describe('fetchJoinInfo — visibility rules (espejo de RLS, post-bypass)', () => {
  const open = { id: 't1', name: 'T', slug: 's', format: 'stroke_play', status: 'open', organizer_id: 'org', date_start: null, codigo: null, course_name: null, courses: null }
  const draft = { ...open, status: 'draft' }
  const inProgress = { ...open, status: 'in_progress' }

  it('devuelve null si tournament no existe', async () => {
    const c = makeMockClient({ tournaments: { data: null } })
    expect(await fetchJoinInfo(c, 's', 'guest')).toBeNull()
  })

  it('permite ver torneo open a un invitado (NO organizer)', async () => {
    const c = makeMockClient({ tournaments: { data: open } })
    const r = await fetchJoinInfo(c, 's', 'guest')
    expect(r?.tournament.id).toBe('t1')
  })

  it('permite ver torneo in_progress, closed, published a invitado', async () => {
    for (const t of [inProgress, { ...open, status: 'closed' }, { ...open, status: 'published' }]) {
      const c = makeMockClient({ tournaments: { data: t } })
      const r = await fetchJoinInfo(c, 's', 'guest')
      expect(r).not.toBeNull()
    }
  })

  it('OCULTA draft a un usuario que NO es el organizer (C1 — espejo de RLS)', async () => {
    const c = makeMockClient({ tournaments: { data: draft } })
    expect(await fetchJoinInfo(c, 's', 'guest')).toBeNull()
  })

  it('permite ver draft al organizer (preview de su propio torneo)', async () => {
    const c = makeMockClient({ tournaments: { data: draft } })
    const r = await fetchJoinInfo(c, 's', 'org')
    expect(r?.tournament.status).toBe('draft')
  })

  it('marca alreadyRegistered si players devuelve un row', async () => {
    const c = makeMockClient({
      tournaments: { data: open },
      players_select: { data: { id: 'p1' }, error: null },
    })
    const r = await fetchJoinInfo(c, 's', 'guest')
    expect(r?.alreadyRegistered).toBe(true)
  })
})

describe('esInscribible — fuente de verdad compartida UI/backend', () => {
  it('SOLO open admite auto-inscripción', () => {
    expect(esInscribible('open')).toBe(true)
  })
  it('draft / in_progress / closed / published / cancelled NO admiten auto-inscripción', () => {
    for (const s of ['draft', 'in_progress', 'closed', 'published', 'cancelled', '']) {
      expect(esInscribible(s)).toBe(false)
    }
  })
})

describe('registerPlayerAndRound — status gating + error mapping', () => {
  const base = { tournamentId: 't1', userId: 'u', courseHandicap: 12 }

  it('rechaza inscripcion en draft (I3 — defense in depth si POST se llama directo)', async () => {
    const c = makeMockClient({})
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'draft' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not_inscribible')
  })

  it('rechaza inscripcion en closed/in_progress (solo open admite auto-inscripcion)', async () => {
    const c = makeMockClient({})
    for (const status of ['in_progress', 'closed', 'published']) {
      const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: status })
      expect(r.ok).toBe(false)
    }
  })

  it('inscribe OK si status=open y todo va bien', async () => {
    const c = makeMockClient({ rpc_result: { ok: true, player_id: 'p1' } })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.playerId).toBe('p1')
  })

  // El cupo + los INSERT (players/rounds) + el mapeo de violaciones viven ahora
  // en el RPC atómico `enroll_player` (SQL, verificado contra prod y cubierto por
  // el canario e2e #255). En JS sólo verificamos que registerPlayerAndRound
  // propague el resultado tipado del RPC sin alterarlo.
  it('propaga tournament_full del RPC (cupo lleno)', async () => {
    const c = makeMockClient({ rpc_result: { ok: false, reason: 'tournament_full', message: 'lleno' } })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('tournament_full')
  })

  it('propaga already_registered del RPC (duplicado)', async () => {
    const c = makeMockClient({ rpc_result: { ok: false, reason: 'already_registered', message: 'dup' } })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('already_registered')
  })

  it('propaga invalid_data del RPC (check / not-null violation)', async () => {
    const c = makeMockClient({ rpc_result: { ok: false, reason: 'invalid_data', message: 'faltan datos' } })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_data')
  })

  it('un error de postgres del RPC → reason unknown', async () => {
    const c = makeMockClient({ rpc_result: null, rpc_error: { message: 'deadlock detected' } })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unknown')
  })
})
