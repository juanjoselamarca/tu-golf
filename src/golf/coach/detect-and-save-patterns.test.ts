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

function mockSupabase(rounds: ReturnType<typeof makeRound>[], upserts?: Array<Record<string, unknown>>) {
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
        return {
          upsert: vi.fn((payload: Record<string, unknown>) => {
            upserts?.push(payload)
            return Promise.resolve({ error: null })
          }),
        }
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

  // Honestidad de datos (reporte 2026-06-02): data_points debe reflejar las rondas
  // que el patrón REALMENTE analizó, no el total del usuario. driving_inconsistency
  // sólo mira las últimas 10 rondas → su data_points debe ser ≤ 10, NUNCA el total (40).
  it('almacena data_points = muestra analizada, no el total global', async () => {
    // 40 rondas de 18h con total_gross muy disperso → driving_inconsistency dispara.
    const rounds = Array.from({ length: 40 }, (_, i) => {
      const r = makeRound(0)
      r.total_gross = i % 2 === 0 ? 80 : 100 // CV alto → patrón detectado
      return r
    })
    const upserts: Array<Record<string, unknown>> = []
    const supabase = mockSupabase(rounds, upserts)
    await detectAndSavePatterns(supabase as never, 'user-1')

    const driving = upserts.find(u => u.pattern_type === 'driving_inconsistency')
    expect(driving).toBeDefined()
    // El patrón analizó las últimas 10 rondas → data_points honesto = 10, no 40.
    expect(driving!.data_points).toBeLessThanOrEqual(10)
    expect(driving!.data_points).not.toBe(rounds.length)

    // Patrones que recorren TODAS las rondas (sin sample/eligible_rounds en metadata)
    // siguen reportando el total — eso es correcto, no overstatement.
    for (const u of upserts) {
      expect(u.data_points as number).toBeLessThanOrEqual(rounds.length)
    }
  })
})
