/**
 * Tests del Compute Plan Outcome — verifica las 7 métricas computables,
 * el handling de las 2 inacomputables (return value=null + reason),
 * y el flow de resolved tras 3 outcomes consecutivos con target_reached.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

let adminInserts: Array<{ table: string; payload: unknown }> = []
let adminUpdates: Array<{ table: string; payload: unknown }> = []

vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        adminInserts.push({ table, payload })
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: `${table}-id` }, error: null }),
          }),
          eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          order: () => ({
            limit: (_n: number) => Promise.resolve({ data: lastOutcomesFixture, error: null }),
          }),
          then: undefined,
        } as unknown as Promise<{ data: { id: string } | null; error: null }>
      },
      update: (payload: unknown) => ({
        eq: () => ({
          eq: () => {
            adminUpdates.push({ table, payload })
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: (_n: number) => Promise.resolve({ data: lastOutcomesFixture, error: null }),
          }),
        }),
      }),
    }),
  }),
}))

// eslint-disable-next-line import/first
import { computePlanOutcomeForRound, type RoundSource } from './compute-plan-outcome'
// eslint-disable-next-line import/first
import type { PlanMetric, TargetOp } from './plan-engine'

// Fixture mutable para simular outcomes previos en .order().limit()
let lastOutcomesFixture: Array<{ target_reached: boolean }> = []

beforeEach(() => {
  adminInserts = []
  adminUpdates = []
  lastOutcomesFixture = []
})

interface UserSupabaseStub {
  plan: {
    metric: PlanMetric
    target_value: number
    target_op: TargetOp
    baseline_value: number | null
  } | null
  round: {
    id: string
    scores: (number | null)[] | null
    par_per_hole?: number[] | null
    total_gross?: number | null
    played_at?: string
  } | null
  historicalGrosses?: number[]
}

function makeSupabase(stub: UserSupabaseStub) {
  return {
    from: (table: string) => {
      if (table === 'coach_plans') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: stub.plan
                    ? { id: 'plan-1', pattern_id: 'p', ...stub.plan, duration_days: 21, created_at: '2026-04-01T00:00:00Z' }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'historical_rounds') {
        // computeTotalGrossCV usa .select().eq().order().limit()
        // loadRound usa .select().eq().eq().maybeSingle()
        const round = stub.round
        return {
          select: () => ({
            eq: (_col: string, _val: string) => ({
              order: () => ({
                limit: () => Promise.resolve({
                  data: (stub.historicalGrosses ?? []).map(g => ({ total_gross: g, played_at: '2026-04-01', holes_played: 18, scores: Array(18).fill(4) })),
                  error: null,
                }),
              }),
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: round
                    ? {
                        id: round.id,
                        scores: round.scores,
                        total_gross: round.total_gross ?? null,
                        par_per_hole: round.par_per_hole ?? null,
                        played_at: round.played_at ?? '2026-04-01T00:00:00Z',
                        metadata: null,
                      }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  } as unknown as Parameters<typeof computePlanOutcomeForRound>[0]['supabase']
}

const STD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]

describe('computePlanOutcomeForRound — métricas computables', () => {
  it('back9_minus_front9_strokes calcula back - front correctamente', async () => {
    const stub: UserSupabaseStub = {
      plan: { metric: 'back9_minus_front9_strokes', target_value: 0, target_op: 'lte', baseline_value: 5 },
      round: {
        id: 'r1',
        // front 9 = 36 (par), back 9 = 42 → delta = +6
        scores: [4,4,3,4,5,4,3,4,5, 5,5,4,5,6,5,4,4,4],
        par_per_hole: STD_PARS,
      },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r1' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const insert = adminInserts.find(i => i.table === 'plan_outcomes')!
    const row = insert.payload as Record<string, unknown>
    expect(row.metric_value).toBe(6) // back 42 - front 36
    expect(row.target_reached).toBe(false) // 6 > 0
    expect(row.delta_vs_baseline).toBe(1) // 6 - baseline 5
    expect(row.compliance).toBe('none')
  })

  it('avg_first_hole_score lee el score del hoyo 1', async () => {
    const stub: UserSupabaseStub = {
      plan: { metric: 'avg_first_hole_score', target_value: 5, target_op: 'lte', baseline_value: 6 },
      round: { id: 'r2', scores: [5, ...Array(17).fill(4)] },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r2' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.metric_value).toBe(5)
    expect(row.target_reached).toBe(true)
  })

  it('par3_avg_vs_par promedia strokes-sobre-par solo en hoyos par-3', async () => {
    // Pares: holes 3,7,12,16 son par 3 (índices 2,6,11,15)
    // Scores en par 3: 4, 3, 4, 3 → sobre par: +1, 0, +1, 0 → avg = 0.5
    const scores = [4,4,4,4,5,4,3,4,5,4,4,4,4,5,4,3,4,5]
    const stub: UserSupabaseStub = {
      plan: { metric: 'par3_avg_vs_par', target_value: 0.3, target_op: 'lte', baseline_value: 0.7 },
      round: { id: 'r3', scores, par_per_hole: STD_PARS },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r3' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.metric_value).toBeCloseTo(0.5, 6)
    expect(row.target_reached).toBe(false) // 0.5 > 0.3
    expect(row.compliance).toBe('partial') // mejoró desde baseline 0.7 hacia target 0.3
  })

  it('post_bogey_score_avg promedia el hoyo siguiente a un bogey o peor', async () => {
    // par 4 todos. Bogeys (score >= 5): idx 0, idx 9, idx 10.
    // post-bogey holes: idx 1 (4), idx 10 (6), idx 11 (4) → avg = 14/3 ≈ 4.667
    const scores = [5,4,4,4,4,4,4,4,4, 5,6,4,4,4,4,4,4,4]
    const stub: UserSupabaseStub = {
      plan: { metric: 'post_bogey_score_avg', target_value: 4.2, target_op: 'lte', baseline_value: 5.5 },
      round: { id: 'r4', scores, par_per_hole: Array(18).fill(4) },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r4' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.metric_value).toBeCloseTo(14 / 3, 6)
    expect(row.target_reached).toBe(false)
    expect(row.compliance).toBe('partial') // 4.667 < baseline 5.5, sigue >target 4.2
  })

  it('double_or_worse_pct = doubles / 18', async () => {
    const scores = [4,4,5,4,4,5,4,4,4, 4,4,4,4,4,5,4,4,4] // 3 doubles (par 4, score 5? eso es bogey no double)
    // ajusto: necesito score >= par + 2. Pares todos 4 → score 6 = double
    const scoresFixed = [6,4,4,4,4,4,4,4,4, 4,4,4,4,4,6,4,4,4] // 2 doubles → 2/18
    const stub: UserSupabaseStub = {
      plan: { metric: 'double_or_worse_pct', target_value: 0.05, target_op: 'lte', baseline_value: 0.2 },
      round: { id: 'r5', scores: scoresFixed, par_per_hole: Array(18).fill(4) },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r5' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.metric_value).toBeCloseTo(2 / 18, 6)
    expect(row.target_reached).toBe(false) // 0.111 > 0.05
    void scores // unused
  })

  it('last4holes_minus_rest_strokes', async () => {
    // primeros 14 todos par 4 → avg 4.0. Últimos 4 todos 5 → avg 5.0. Delta = +1.0
    const scores = [...Array(14).fill(4), 5,5,5,5]
    const stub: UserSupabaseStub = {
      plan: { metric: 'last4holes_minus_rest_strokes', target_value: 0.5, target_op: 'lte', baseline_value: 1.5 },
      round: { id: 'r6', scores, par_per_hole: STD_PARS },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r6' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.metric_value).toBe(1)
    expect(row.target_reached).toBe(false)
    expect(row.compliance).toBe('partial')
  })

  it('total_gross_cv usa las últimas 10 rondas históricas', async () => {
    // Si todas iguales → CV=0
    const stub: UserSupabaseStub = {
      plan: { metric: 'total_gross_cv', target_value: 0.05, target_op: 'lte', baseline_value: 0.10 },
      round: { id: 'r7', scores: Array(18).fill(4), par_per_hole: STD_PARS, total_gross: 72 },
      historicalGrosses: [85, 85, 85, 85, 85, 85, 85, 85, 85, 85],
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r7' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.metric_value).toBeCloseTo(0, 6)
    expect(row.target_reached).toBe(true)
    expect(row.compliance).toBe('full')
  })
})

describe('computePlanOutcomeForRound — métricas no rastreadas', () => {
  it('three_putts_per_round retorna compliance unknown', async () => {
    const stub: UserSupabaseStub = {
      plan: { metric: 'three_putts_per_round', target_value: 1, target_op: 'lte', baseline_value: 2 },
      round: { id: 'r8', scores: Array(18).fill(4), par_per_hole: STD_PARS },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r8' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    const row = adminInserts.find(i => i.table === 'plan_outcomes')!.payload as Record<string, unknown>
    expect(row.compliance).toBe('unknown')
    expect(row.target_reached).toBe(false)
    expect(row.delta_vs_baseline).toBeNull()
  })
})

describe('computePlanOutcomeForRound — lifecycle', () => {
  it('no_active_plan cuando el usuario no tiene plan activo', async () => {
    const stub: UserSupabaseStub = { plan: null, round: { id: 'r0', scores: [] } }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r0' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    expect(res.reason).toBe('no_active_plan')
    expect(adminInserts).toHaveLength(0)
  })

  it('round_not_found cuando la ronda no existe', async () => {
    const stub: UserSupabaseStub = {
      plan: { metric: 'avg_first_hole_score', target_value: 4, target_op: 'lte', baseline_value: 5 },
      round: null,
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r-missing' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    expect(res.reason).toBe('round_not_found')
    expect(adminInserts).toHaveLength(0)
  })

  it('plan resolved tras 3 outcomes consecutivos con target_reached', async () => {
    lastOutcomesFixture = [
      { target_reached: true },
      { target_reached: true },
      { target_reached: true },
    ]
    const stub: UserSupabaseStub = {
      plan: { metric: 'avg_first_hole_score', target_value: 5, target_op: 'lte', baseline_value: 6 },
      round: { id: 'r-resolve', scores: [5, ...Array(17).fill(4)] },
    }
    const res = await computePlanOutcomeForRound({
      supabase: makeSupabase(stub), userId: 'u-1',
      roundSource: { historical_round_id: 'r-resolve' } as RoundSource,
    })
    expect(res.ok).toBe(true)
    expect(res.plan_resolved).toBe(true)

    const update = adminUpdates.find(u => u.table === 'coach_plans')
    expect(update).toBeTruthy()
    expect((update!.payload as Record<string, unknown>).status).toBe('resolved')
    expect((update!.payload as Record<string, unknown>).resolution_reason).toBe('target_reached_3_consecutive')

    const evt = adminInserts.find(
      i => i.table === 'coach_events' && (i.payload as { type: string }).type === 'plan_resolved',
    )
    expect(evt).toBeTruthy()
  })
})
