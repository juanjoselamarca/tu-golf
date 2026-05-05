import { describe, it, expect, vi } from 'vitest'
import { detectAndSavePatterns } from './detect-and-save-patterns'

function makeRound(scoreOffset: number) {
  return {
    scores: Array.from({ length: 18 }, (_, i) => 4 + (i % 3) + scoreOffset),
    total_gross: 90 + scoreOffset,
    holes_played: 18,
    metadata: null,
    course_id: null,
    courses: { par_total: 72 },
  }
}

function mockSupabase(rounds: ReturnType<typeof makeRound>[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'historical_rounds') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => Promise.resolve({ data: rounds })),
            })),
          })),
        }
      }
      if (table === 'course_holes') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [] })),
            })),
          })),
        }
      }
      if (table === 'player_patterns') {
        return { upsert: vi.fn(() => Promise.resolve({ error: null })) }
      }
      if (table === 'profiles') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        }
      }
      return {}
    }),
  }
}

describe('detectAndSavePatterns', () => {
  it('processes 100% of rounds (no .limit(50) cap)', async () => {
    const rounds = Array.from({ length: 80 }, (_, i) => makeRound(i % 5))
    const supabase = mockSupabase(rounds)
    const result = await detectAndSavePatterns(supabase as never, 'user-1')
    expect(result.total_rounds).toBe(80)
  })

  it('returns 0 detected with less than 5 rounds', async () => {
    const rounds = Array.from({ length: 3 }, () => makeRound(0))
    const supabase = mockSupabase(rounds)
    const result = await detectAndSavePatterns(supabase as never, 'user-1')
    expect(result.detected).toBe(0)
  })
})
