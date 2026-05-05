import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub createAdminClient antes de importar plan-engine para evitar
// que el insert a coach_events corra contra prod en tests.
let adminInsertSpy: ReturnType<typeof vi.fn>
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (...args: unknown[]) => {
        adminInsertSpy(...args)
        return Promise.resolve({ data: null, error: null })
      },
    }),
  }),
}))

// eslint-disable-next-line import/first -- mock arriba debe correr antes
import { savePlan, type SavePlanInput, PATTERN_IDS, PLAN_METRICS } from './plan-engine'

beforeEach(() => {
  adminInsertSpy = vi.fn()
})

const baseInput: SavePlanInput = {
  pattern_id: 'three_putt_frequency',
  observation_data: { data_points: 8, metric_value: 2.4, confidence: 0.82 },
  hypothesis: 'Tres putts en 9 de cada 10 rondas — los lags de larga distancia mueren cortos.',
  plan: {
    rule: 'Antes de cada green, lee el contorno desde dos lados. Drill clock 1m diario.',
    metric: 'three_putts_per_round',
    target_value: 1,
    target_op: 'lte',
    duration_days: 21,
  },
}

function makeStubSupabase(opts: {
  existingPlan?: { id: string; pattern_id: string } | null
  insertOk?: boolean
  updateOk?: boolean
}) {
  const existing = opts.existingPlan ?? null
  const insertOk = opts.insertOk ?? true
  const updateOk = opts.updateOk ?? true

  const update = vi.fn(() => ({
    eq: () => ({
      eq: () =>
        Promise.resolve({
          data: null,
          error: updateOk ? null : { message: 'update failed' },
        }),
    }),
  }))

  const insert = vi.fn(() => ({
    select: () => ({
      single: () =>
        Promise.resolve({
          data: insertOk ? { id: 'plan-new-uuid' } : null,
          error: insertOk ? null : { message: 'insert failed' },
        }),
    }),
  }))

  const fromMock = vi.fn((table: string) => {
    if (table !== 'coach_plans') throw new Error(`Unexpected table: ${table}`)
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: existing,
                error: null,
              }),
          }),
        }),
      }),
      update,
      insert,
    }
  })

  return {
    supabase: { from: fromMock } as unknown as Parameters<typeof savePlan>[0]['supabase'],
    update,
    insert,
    fromMock,
  }
}

describe('savePlan', () => {
  it('inserta el plan cuando no existe activo previo', async () => {
    const { supabase, insert, update } = makeStubSupabase({ existingPlan: null })
    const result = await savePlan({ supabase, userId: 'user-1', sessionId: 'sess-1' }, baseInput)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan_id).toBe('plan-new-uuid')
      expect(result.superseded_plan_id).toBeNull()
      expect(result.summary).toContain('three_putt_frequency')
    }
    expect(update).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledTimes(1)
    // baseline_value debe igualar observation_data.metric_value
    const insertedRow = (insert.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>
    expect(insertedRow.baseline_value).toBe(2.4)
    expect(insertedRow.assigned_by).toBe('tAIger')
    expect(insertedRow.session_id).toBe('sess-1')

    // Un solo evento (plan_assigned) cuando no hay supersede
    expect(adminInsertSpy).toHaveBeenCalledTimes(1)
    const evt = (adminInsertSpy.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>
    expect(evt.type).toBe('plan_assigned')
  })

  it('supersede el plan activo previo y registra dos eventos (plan_assigned + plan_superseded)', async () => {
    const { supabase, update, insert } = makeStubSupabase({
      existingPlan: { id: 'plan-old', pattern_id: 'first_hole_anxiety' },
    })

    const result = await savePlan({ supabase, userId: 'user-1', sessionId: null }, baseInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.superseded_plan_id).toBe('plan-old')
      expect(result.summary).toContain('superseded')
    }

    expect(update).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledTimes(1)

    // Dos eventos: plan_assigned + plan_superseded
    expect(adminInsertSpy).toHaveBeenCalledTimes(2)
    const types = adminInsertSpy.mock.calls.map(call => (call[0] as { type: string }).type)
    expect(types).toContain('plan_assigned')
    expect(types).toContain('plan_superseded')
  })

  it('marca resolution_reason=pattern_refined cuando el plan previo es del MISMO pattern_id', async () => {
    const { supabase, update } = makeStubSupabase({
      existingPlan: { id: 'plan-old', pattern_id: 'three_putt_frequency' },
    })
    const result = await savePlan({ supabase, userId: 'user-1' }, baseInput)
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    const updatedFields = (update.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>
    expect(updatedFields.resolution_reason).toBe('pattern_refined')
    expect(updatedFields.status).toBe('superseded')
  })

  it('falla limpio si el INSERT del plan nuevo falla', async () => {
    const { supabase } = makeStubSupabase({ existingPlan: null, insertOk: false })
    const result = await savePlan({ supabase, userId: 'user-1' }, baseInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Error insertando plan nuevo/)
  })

  it('PATTERN_IDS y PLAN_METRICS estan congelados al set canonico de 9 valores cada uno', () => {
    expect(PATTERN_IDS.length).toBe(9)
    expect(PLAN_METRICS.length).toBe(9)
    expect(new Set(PATTERN_IDS).size).toBe(9)
    expect(new Set(PLAN_METRICS).size).toBe(9)
  })
})
