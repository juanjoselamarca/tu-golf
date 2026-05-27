import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchJoinInfo, registerPlayerAndRound } from './joinFlow'

// Fabrica un SupabaseClient mockeado donde cada `.from(tabla)` devuelve un objeto
// con los metodos chaining que usan fetchJoinInfo y registerPlayerAndRound.
// `tableData` maps tabla → respuesta de .maybeSingle()/.single().
function makeMockClient(tableData: {
  tournaments?: { data: unknown; error?: { message: string; code?: string } | null }
  profiles?: { data: unknown; error?: null }
  players_select?: { data: unknown; error?: null }
  players_insert?: { data: unknown; error?: { message: string; code?: string } | null }
  rounds_insert?: { error?: { message: string } | null }
}): SupabaseClient {
  return {
    from: vi.fn((tabla: string) => {
      if (tabla === 'tournaments') {
        const r = tableData.tournaments
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(r ?? { data: null, error: null }),
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
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(sel) }) }),
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
    const c = makeMockClient({
      players_insert: { data: { id: 'p1' }, error: null },
    })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.playerId).toBe('p1')
  })

  it('mapea PG 23505 (unique violation) a already_registered', async () => {
    const c = makeMockClient({
      players_insert: { data: null, error: { message: 'duplicate key value', code: '23505' } },
    })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('already_registered')
  })

  it('mapea PG 42501 (RLS deny) a forbidden', async () => {
    const c = makeMockClient({
      players_insert: { data: null, error: { message: 'new row violates RLS policy', code: '42501' } },
    })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('forbidden')
  })

  it('mapea NOT NULL / check violation a invalid_data', async () => {
    const c = makeMockClient({
      players_insert: { data: null, error: { message: 'null value in column violates not-null constraint' } },
    })
    const r = await registerPlayerAndRound(c, { ...base, tournamentStatus: 'open' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid_data')
  })
})
