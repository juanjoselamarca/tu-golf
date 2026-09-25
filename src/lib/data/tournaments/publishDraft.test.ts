// Reproduce el bug P0 (inbox 652707d2): un torneo de 2 rondas en canchas
// distintas fallaba con "rounds: Could not find the 'course_id' column of
// 'rounds'". Acá se fija que la configuración por ronda va a
// `tournament_rounds`, nunca a `rounds` (tarjetas por jugador), y que un fallo
// en cualquier hijo compensa borrando el torneo.

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { publishTournamentFromConfig } from './publishDraft'
import type { TournamentConfig } from '@/lib/draft/types'

interface Insert { table: string; rows: unknown }

/**
 * Cliente falso: registra cada insert por tabla y permite hacer fallar una.
 * Emula el shape encadenable de supabase-js (`insert().select().single()`).
 */
function fakeService(opts: { failOn?: string; failDelete?: boolean } = {}) {
  const inserts: Insert[] = []
  const deletes: string[] = []
  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          inserts.push({ table, rows })
          const result = opts.failOn === table
            ? { data: null, error: { message: `boom ${table}` } }
            : { data: table === 'tournaments' ? { id: 'tour-1', slug: 'mi-torneo-x' } : null, error: null }
          const p = Promise.resolve(result)
          return Object.assign(p, {
            select: () => ({ single: () => Promise.resolve(result) }),
          })
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
  return { client: client as unknown as Parameters<typeof publishTournamentFromConfig>[0], inserts, deletes }
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

  it('si falla el insert de tournaments no hay nada que compensar', async () => {
    const { client, deletes } = fakeService({ failOn: 'tournaments' })
    await expect(publishTournamentFromConfig(client, config(), META)).rejects.toThrow(/boom tournaments/)
    expect(deletes).toEqual([])
  })
})
