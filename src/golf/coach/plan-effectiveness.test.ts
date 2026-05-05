import { describe, it, expect, vi } from 'vitest'
import { computePlanEffectiveness } from './plan-effectiveness'

interface Plan {
  id: string
  user_id: string
  pattern_id: string
  status: string
  resolution_reason: string | null
  created_at: string
  resolved_at: string | null
  duration_days: number
}
interface Outcome {
  plan_id: string
  target_reached: boolean
  compliance: 'full' | 'partial' | 'none' | 'unknown'
  played_at: string
}

function fakeSupabase(plans: Plan[], outcomes: Outcome[]) {
  return {
    from: vi.fn((table: string) => ({
      select: () => Promise.resolve({
        data: table === 'coach_plans' ? plans : outcomes,
        error: null,
      }),
    })),
  } as unknown as Parameters<typeof computePlanEffectiveness>[0]
}

describe('computePlanEffectiveness', () => {
  it('devuelve totales en cero cuando no hay planes', async () => {
    const k = await computePlanEffectiveness(fakeSupabase([], []))
    expect(k.total_plans).toBe(0)
    expect(k.resolved_by_target_rate).toBeNull()
    expect(k.avg_days_to_resolution).toBeNull()
    expect(k.per_pattern).toHaveLength(0)
  })

  it('cuenta correctamente planes por status y outcomes por compliance', async () => {
    const plans: Plan[] = [
      { id: 'a', user_id: 'u1', pattern_id: 'three_putt_frequency', status: 'active', resolution_reason: null, created_at: '2026-04-01T00:00:00Z', resolved_at: null, duration_days: 21 },
      { id: 'b', user_id: 'u2', pattern_id: 'three_putt_frequency', status: 'resolved', resolution_reason: 'target_reached_3_consecutive', created_at: '2026-03-01T00:00:00Z', resolved_at: '2026-03-22T00:00:00Z', duration_days: 21 },
      { id: 'c', user_id: 'u1', pattern_id: 'first_hole_anxiety', status: 'expired', resolution_reason: 'duration_exceeded', created_at: '2026-02-01T00:00:00Z', resolved_at: '2026-02-25T00:00:00Z', duration_days: 21 },
      { id: 'd', user_id: 'u3', pattern_id: 'three_putt_frequency', status: 'superseded', resolution_reason: 'higher_priority_pattern', created_at: '2026-04-15T00:00:00Z', resolved_at: '2026-04-20T00:00:00Z', duration_days: 21 },
    ]
    const outcomes: Outcome[] = [
      { plan_id: 'b', target_reached: true, compliance: 'full', played_at: '2026-03-10' },
      { plan_id: 'b', target_reached: true, compliance: 'full', played_at: '2026-03-15' },
      { plan_id: 'b', target_reached: true, compliance: 'full', played_at: '2026-03-22' },
      { plan_id: 'c', target_reached: false, compliance: 'partial', played_at: '2026-02-10' },
      { plan_id: 'c', target_reached: false, compliance: 'none', played_at: '2026-02-20' },
    ]
    const k = await computePlanEffectiveness(fakeSupabase(plans, outcomes))

    expect(k.total_plans).toBe(4)
    expect(k.active_plans).toBe(1)
    expect(k.resolved_plans).toBe(1)
    expect(k.expired_plans).toBe(1)
    expect(k.superseded_plans).toBe(1)
    expect(k.adherence_distribution).toEqual({ full: 3, partial: 1, none: 1, unknown: 0 })
    expect(k.resolved_by_target_rate).toBe(1) // 1/1 resolved fueron por target
    expect(k.avg_days_to_resolution).toBe(21)
    expect(k.total_outcomes).toBe(5)
    expect(k.total_users_with_plan).toBe(3)
  })

  it('per_pattern agrupa por pattern_id', async () => {
    const plans: Plan[] = [
      { id: 'a', user_id: 'u1', pattern_id: 'three_putt_frequency', status: 'resolved', resolution_reason: 'target_reached_3_consecutive', created_at: '2026-03-01T00:00:00Z', resolved_at: '2026-03-22T00:00:00Z', duration_days: 21 },
      { id: 'b', user_id: 'u2', pattern_id: 'three_putt_frequency', status: 'expired', resolution_reason: 'duration_exceeded', created_at: '2026-02-01T00:00:00Z', resolved_at: '2026-02-25T00:00:00Z', duration_days: 21 },
      { id: 'c', user_id: 'u3', pattern_id: 'first_hole_anxiety', status: 'resolved', resolution_reason: 'target_reached_3_consecutive', created_at: '2026-04-01T00:00:00Z', resolved_at: '2026-04-15T00:00:00Z', duration_days: 14 },
    ]
    const k = await computePlanEffectiveness(fakeSupabase(plans, []))

    expect(k.per_pattern).toHaveLength(2)
    const tp = k.per_pattern.find(p => p.pattern_id === 'three_putt_frequency')!
    expect(tp.total_plans).toBe(2) // 1 resolved + 1 expired
    expect(tp.resolved_count).toBe(1) // solo el resolved
    expect(tp.target_reached_count).toBe(1)
    expect(tp.target_reached_rate).toBe(1) // 1/1 resueltos llegaron al target
    const fha = k.per_pattern.find(p => p.pattern_id === 'first_hole_anxiety')!
    expect(fha.target_reached_count).toBe(1)
    expect(fha.target_reached_rate).toBe(1)
  })
})
