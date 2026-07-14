import { describe, it, expect, vi } from 'vitest'
import { fetchStatsRounds } from './stats'

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(async () => {}),
}))

function mockSupabase(handlers: unknown) {
  return handlers as never
}

describe('fetchStatsRounds', () => {
  it('devuelve rondas enriquecidas con par_played (desde par_per_hole + scores)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [{
                id: 'r1', course_name: 'Los Leones', tee_color: null,
                played_at: '2026-01-10', scores: [4, 3, 5], total_gross: 12,
                notes: null, privacy: 'private', created_at: '2026-01-10',
                holes_played: null,
                par_per_hole: { '1': 4, '2': 3, '3': 5 },
              }],
              error: null,
            }),
          }),
        }),
      }),
    }
    const rounds = await fetchStatsRounds(mockSupabase(supabase), 'u1')
    expect(rounds).toHaveLength(1)
    expect(rounds[0].par_played).toBe(12) // 4+3+5, solo hoyos con score
  })

  it('par_played null cuando no hay par_per_hole', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [{
                id: 'r1', course_name: 'X', tee_color: null,
                played_at: '2026-01-10', scores: [4, 3], total_gross: 7,
                notes: null, privacy: 'private', created_at: '2026-01-10',
                holes_played: null, par_per_hole: null,
              }],
              error: null,
            }),
          }),
        }),
      }),
    }
    const rounds = await fetchStatsRounds(mockSupabase(supabase), 'u1')
    expect(rounds[0].par_played).toBeNull()
  })

  it('error de query → [] (la UI cae al empty state, no rompe)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: null, error: { message: 'boom' } }),
          }),
        }),
      }),
    }
    const rounds = await fetchStatsRounds(mockSupabase(supabase), 'u1')
    expect(rounds).toEqual([])
  })
})
