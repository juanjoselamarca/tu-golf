import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadObservationPairs } from '../pattern-observations'

type Rows = { obs: unknown[]; rounds: unknown[] }
function fakeClient(r: Rows): SupabaseClient {
  return {
    from(table: string) {
      const data = table === 'pattern_observations' ? r.obs : r.rounds
      return { select: () => ({ eq: () => Promise.resolve({ data, error: null }) }) }
    },
  } as unknown as SupabaseClient
}

const ROUND = (id: string, over: Record<string, unknown> = {}) => ({
  id, diferencial: 12, course_rating: 72, holes_played: 18, excluded_from_handicap: false, ...over,
})

describe('loadObservationPairs — serie (x=value, y=diferencial) por patrón', () => {
  it('arma los pares por pattern_key joinneando con el diferencial elegible', async () => {
    const client = fakeClient({
      obs: [
        { pattern_key: 'post_bogey_spiral', value: 5.3, round_id: 'r1' },
        { pattern_key: 'post_bogey_spiral', value: 4.1, round_id: 'r2' },
        { pattern_key: 'back_nine_collapse', value: 2.0, round_id: 'r1' },
      ],
      rounds: [ROUND('r1', { diferencial: 10 }), ROUND('r2', { diferencial: 14 })],
    })
    const pairs = await loadObservationPairs(client, 'u1')
    expect(pairs['post_bogey_spiral']).toEqual([{ x: 5.3, y: 10 }, { x: 4.1, y: 14 }])
    expect(pairs['back_nine_collapse']).toEqual([{ x: 2.0, y: 10 }])
  })

  it('descarta observaciones de rondas no elegibles (excluida, sin diferencial, 9h legacy CR<55)', async () => {
    const client = fakeClient({
      obs: [
        { pattern_key: 'p', value: 1, round_id: 'ok' },
        { pattern_key: 'p', value: 2, round_id: 'excluida' },
        { pattern_key: 'p', value: 3, round_id: 'sin_dif' },
        { pattern_key: 'p', value: 4, round_id: 'nineh' },
      ],
      rounds: [
        ROUND('ok', { diferencial: 11 }),
        ROUND('excluida', { excluded_from_handicap: true }),
        ROUND('sin_dif', { diferencial: null }),
        ROUND('nineh', { course_rating: 36 }), // 9h legacy raw → CR<55
      ],
    })
    const pairs = await loadObservationPairs(client, 'u1')
    expect(pairs['p']).toEqual([{ x: 1, y: 11 }])
  })

  it('sin observaciones → objeto vacío (no rompe)', async () => {
    const pairs = await loadObservationPairs(fakeClient({ obs: [], rounds: [] }), 'u1')
    expect(pairs).toEqual({})
  })
})
