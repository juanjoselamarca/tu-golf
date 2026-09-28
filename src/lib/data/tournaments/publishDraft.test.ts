// Reproduce el bug P0 (inbox 652707d2): un torneo de 2 rondas en canchas
// distintas fallaba con "rounds: Could not find the 'course_id' column of
// 'rounds'". Acá se fija que la configuración por ronda va a
// `tournament_rounds`, nunca a `rounds` (tarjetas por jugador), y que un fallo
// en cualquier hijo compensa borrando el torneo.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import {
  CREATING_STALE_MS,
  creatingIsStale,
  findRecoverableTournament,
  lockAndPublish,
  publishTournamentFromConfig,
  type DraftForPublish,
} from './publishDraft'
import type { TournamentConfig } from '@/lib/draft/types'

interface Insert { table: string; rows: unknown }
interface Update { table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }

/**
 * Cliente falso: registra inserts/updates por tabla y permite hacer fallar una.
 * Emula el shape encadenable de supabase-js (`insert().select().single()`,
 * `update().eq().eq().select()`, `select().eq().maybeSingle()`).
 */
function fakeService(opts: {
  failOn?: string
  failDelete?: boolean
  /** Código Postgres del fallo del insert de `tournaments`. */
  tournamentsErrorCode?: string
  /** Fila que devuelve `tournaments.select().eq('id').maybeSingle()`. */
  existingTournament?: { id: string; slug: string } | null
  /** Filas afectadas por el UPDATE del lock (0 = lo ganó otro). */
  lockRows?: number
} = {}) {
  const inserts: Insert[] = []
  const updates: Update[] = []
  const deletes: string[] = []
  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          inserts.push({ table, rows })
          const result = opts.failOn === table
            ? { data: null, error: { message: `boom ${table}`, code: table === 'tournaments' ? opts.tournamentsErrorCode ?? null : null } }
            : { data: table === 'tournaments' ? { id: (rows as { id?: string }).id ?? 'tour-1', slug: 'mi-torneo-x' } : null, error: null }
          const p = Promise.resolve(result)
          return Object.assign(p, {
            select: () => ({ single: () => Promise.resolve(result) }),
          })
        },
        update(patch: Record<string, unknown>) {
          const u: Update = { table, patch, filters: [] }
          updates.push(u)
          const rows = table === 'tournament_drafts' && patch.status === 'creating'
            ? Array.from({ length: opts.lockRows ?? 1 }, () => ({ id: 'd1' }))
            : [{ id: 'x' }]
          const chain = {
            eq: (col: string, val: unknown) => { u.filters.push([col, val]); return chain },
            select: () => Promise.resolve({ data: rows, error: null }),
            then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
          }
          return chain
        },
        select() {
          return {
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: opts.existingTournament ?? null, error: null }),
            }),
          }
        },
        delete() {
          return {
            eq: (_col: string, id: string) => {
              deletes.push(id)
              return Promise.resolve({ error: opts.failDelete ? { message: 'no delete' } : null })
            },
          }
        },
      }
    },
  }
  return { client: client as unknown as Parameters<typeof publishTournamentFromConfig>[0], inserts, updates, deletes }
}

function config(over: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    schema_version: 1,
    name: 'Copa Dos Canchas',
    date_start: '2026-10-10',
    cover_image_url: null,
    format: 'stroke_play',
    modo: 'neto',
    use_handicap: true,
    categories: [
      { id: 'c1', name: 'Damas', handicap_min: 0, handicap_max: 36, gender: 'female', default_tee_color: 'rojo' },
    ],
    rounds: [
      { round_number: 1, date: '2026-10-10', course_id: 'cancha-A', hole_count: 18, tee_assignment_mode: 'per_category' },
      { round_number: 2, date: '2026-10-11', course_id: 'cancha-B', hole_count: 18, tee_assignment_mode: 'per_category' },
    ],
    registration: { mode: 'open_with_code' },
    prizes: [],
    is_practice: false,
    pending_confirmations: [],
    ...over,
  }
}

const META = { organizerId: 'org-1', slug: 'mi-torneo-x', code: 'ABC234' }

describe('publishTournamentFromConfig — torneo de 2 rondas en canchas distintas', () => {
  it('crea el torneo y persiste la ronda 2 en tournament_rounds con SU cancha (no en rounds)', async () => {
    const { client, inserts } = fakeService()
    const out = await publishTournamentFromConfig(client, config(), META)

    expect(out).toEqual({ tournamentId: 'tour-1', slug: 'mi-torneo-x' })
    expect(inserts.map((i) => i.table)).toEqual(['tournaments', 'categories', 'tournament_rounds'])
    expect(inserts.some((i) => i.table === 'rounds')).toBe(false)

    const tour = inserts[0].rows as Record<string, unknown>
    expect(tour.course_id).toBe('cancha-A')
    expect(tour.total_rounds).toBe(2)
    expect(tour.date_start).toBe('2026-10-10')
    expect(tour.date_end).toBe('2026-10-11')

    const rondas = inserts[2].rows as Array<Record<string, unknown>>
    expect(rondas).toHaveLength(1)
    expect(rondas[0]).toMatchObject({
      tournament_id: 'tour-1',
      round_number: 2,
      course_id: 'cancha-B',
      date: '2026-10-11',
      hole_count: 18,
    })
  })

  it('las categorías llegan con gender y default_tee_color (antes se descartaban)', async () => {
    const { client, inserts } = fakeService()
    await publishTournamentFromConfig(client, config(), META)
    const cats = inserts.find((i) => i.table === 'categories')!.rows as Array<Record<string, unknown>>
    expect(cats[0]).toMatchObject({ name: 'Damas', gender: 'F', default_tee_color: 'rojo' })
  })

  it('torneo de una ronda: no toca tournament_rounds', async () => {
    const { client, inserts } = fakeService()
    const c = config({ rounds: [config().rounds[0]] })
    await publishTournamentFromConfig(client, c, META)
    expect(inserts.map((i) => i.table)).toEqual(['tournaments', 'categories'])
  })

  it('si falla tournament_rounds, borra el torneo (compensación) y propaga el paso', async () => {
    const { client, deletes } = fakeService({ failOn: 'tournament_rounds' })
    await expect(publishTournamentFromConfig(client, config(), META)).rejects.toThrow(/tournament_rounds: boom/)
    expect(deletes).toEqual(['tour-1'])
  })

  it('si falla categories, compensa igual', async () => {
    const { client, deletes } = fakeService({ failOn: 'categories' })
    await expect(publishTournamentFromConfig(client, config(), META)).rejects.toThrow(/categories: boom/)
    expect(deletes).toEqual(['tour-1'])
  })

  it('con tournamentId pre-generado, el insert lo usa como id (reintento idempotente)', async () => {
    const { client, inserts } = fakeService()
    await publishTournamentFromConfig(client, config(), { ...META, tournamentId: 'pre-generado' })
    expect((inserts[0].rows as Record<string, unknown>).id).toBe('pre-generado')
    // Sin él, la base genera el id.
    const { client: c2, inserts: i2 } = fakeService()
    await publishTournamentFromConfig(c2, config(), META)
    expect((i2[0].rows as Record<string, unknown>).id).toBeUndefined()
  })

  it('si falla el insert de tournaments no hay nada que compensar', async () => {
    const { client, deletes } = fakeService({ failOn: 'tournaments' })
    await expect(publishTournamentFromConfig(client, config(), META)).rejects.toThrow(/boom tournaments/)
    expect(deletes).toEqual([])
  })
})

// ── Publicación idempotente con lock (re-review #421: CR-1 + I3) ──────────

const NOW = new Date('2026-09-25T15:00:00Z')
function draft(over: Partial<DraftForPublish> = {}): DraftForPublish {
  return { id: 'd1', status: 'draft', tournament_id: null, pending_tournament_id: null, updated_at: NOW.toISOString(), ...over }
}
const lockDe = (updates: Update[]) => updates.find((u) => u.table === 'tournament_drafts' && u.patch.status === 'creating')
const cierreDe = (updates: Update[]) => updates.find((u) => u.table === 'tournament_drafts' && u.patch.status === 'created')

describe('lockAndPublish — el id se reserva en pending_tournament_id, nunca en tournament_id (FK) antes del insert', () => {
  it('draft → lock CAS sobre el status leído → insert con el id reservado → created con tournament_id', async () => {
    const { client, inserts, updates } = fakeService()
    const out = await lockAndPublish(client, draft(), config(), 'org-1', { now: NOW, tournamentId: 'reservado' })
    expect(out).toEqual({ kind: 'ok', tournamentId: 'reservado', slug: 'mi-torneo-x', recovered: false })

    const lock = lockDe(updates)!
    expect(lock.patch).toEqual({ status: 'creating', pending_tournament_id: 'reservado' })
    expect(lock.patch).not.toHaveProperty('tournament_id') // la FK no se toca antes del insert
    expect(lock.filters).toEqual([['id', 'd1'], ['status', 'draft']]) // compare-and-set

    expect((inserts[0].rows as { id: string }).id).toBe('reservado')
    expect(cierreDe(updates)!.patch).toEqual({ status: 'created', tournament_id: 'reservado', pending_tournament_id: null })
  })

  it('el lock lo ganó otro (0 filas) → lock_lost, sin insertar nada', async () => {
    const { client, inserts } = fakeService({ lockRows: 0 })
    expect(await lockAndPublish(client, draft(), config(), 'org-1', { now: NOW })).toEqual({ kind: 'lock_lost' })
    expect(inserts).toEqual([])
  })

  it("'creating' reciente → in_progress (otro intento en curso), no se toca", async () => {
    const { client, inserts, updates } = fakeService()
    const reciente = draft({ status: 'creating', pending_tournament_id: 'x', updated_at: new Date(NOW.getTime() - 5_000).toISOString() })
    expect(await lockAndPublish(client, reciente, config(), 'org-1', { now: NOW })).toEqual({ kind: 'in_progress' })
    expect(inserts).toEqual([])
    expect(updates).toEqual([])
  })

  it("'creating' viejo → se retoma con el MISMO id reservado", async () => {
    const { client, inserts, updates } = fakeService()
    const viejo = draft({ status: 'creating', pending_tournament_id: 'reservado', updated_at: new Date(NOW.getTime() - CREATING_STALE_MS - 1).toISOString() })
    const out = await lockAndPublish(client, viejo, config(), 'org-1', { now: NOW })
    expect(out.kind).toBe('ok')
    expect((inserts[0].rows as { id: string }).id).toBe('reservado')
    expect(lockDe(updates)!.filters).toEqual([['id', 'd1'], ['status', 'creating']])
  })

  it('23505 en el insert (el intento anterior sí creó el torneo) → se recupera, NO se resetea el draft', async () => {
    const { client, updates, deletes } = fakeService({
      failOn: 'tournaments', tournamentsErrorCode: '23505', existingTournament: { id: 'reservado', slug: 'ya-existia' },
    })
    const out = await lockAndPublish(client, draft(), config(), 'org-1', { now: NOW, tournamentId: 'reservado' })
    expect(out).toEqual({ kind: 'ok', tournamentId: 'reservado', slug: 'ya-existia', recovered: true })
    expect(updates.some((u) => u.patch.status === 'draft')).toBe(false)
    expect(cierreDe(updates)).toBeTruthy()
    expect(deletes).toEqual([])
  })

  it('otro fallo → compensa, vuelve a draft sin reserva y propaga', async () => {
    const { client, updates, deletes } = fakeService({ failOn: 'categories' })
    await expect(lockAndPublish(client, draft(), config(), 'org-1', { now: NOW, tournamentId: 'r' })).rejects.toThrow(/categories/)
    expect(deletes).toEqual(['r'])
    expect(updates.at(-1)!.patch).toEqual({ status: 'draft', pending_tournament_id: null })
  })

  it("'archived' / 'created' → not_draft", async () => {
    const { client } = fakeService()
    expect(await lockAndPublish(client, draft({ status: 'archived' }), config(), 'org-1', { now: NOW })).toEqual({ kind: 'not_draft' })
    expect(await lockAndPublish(client, draft({ status: 'created', tournament_id: 't' }), config(), 'org-1', { now: NOW })).toEqual({ kind: 'not_draft' })
  })
})

describe('findRecoverableTournament / creatingIsStale', () => {
  it("'created' con torneo existente → ese torneo", async () => {
    const { client } = fakeService({ existingTournament: { id: 't', slug: 's' } })
    expect(await findRecoverableTournament(client, draft({ status: 'created', tournament_id: 't' }))).toEqual({ tournamentId: 't', slug: 's' })
  })

  it("'creating' con el reservado ya insertado → cierra el draft y devuelve el torneo", async () => {
    const { client, updates } = fakeService({ existingTournament: { id: 'r', slug: 's' } })
    const out = await findRecoverableTournament(client, draft({ status: 'creating', pending_tournament_id: 'r' }))
    expect(out).toEqual({ tournamentId: 'r', slug: 's' })
    expect(cierreDe(updates)!.patch.tournament_id).toBe('r')
  })

  it("'creating' cuyo reservado no existe, o 'draft' → null (hay que publicar)", async () => {
    const { client } = fakeService({ existingTournament: null })
    expect(await findRecoverableTournament(client, draft({ status: 'creating', pending_tournament_id: 'r' }))).toBeNull()
    expect(await findRecoverableTournament(client, draft())).toBeNull()
  })

  it('creatingIsStale: umbral de 60 s; sin updated_at cuenta como viejo', () => {
    expect(creatingIsStale(draft({ status: 'creating', updated_at: new Date(NOW.getTime() - 1_000).toISOString() }), NOW)).toBe(false)
    expect(creatingIsStale(draft({ status: 'creating', updated_at: new Date(NOW.getTime() - 61_000).toISOString() }), NOW)).toBe(true)
    expect(creatingIsStale(draft({ status: 'creating', updated_at: null }), NOW)).toBe(true)
    expect(creatingIsStale(draft({ status: 'draft' }), NOW)).toBe(false)
  })
})
