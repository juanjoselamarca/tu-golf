/**
 * Smoke tests del dispatcher save_plan en tools.executeTool.
 * Verifica validacion del input antes de delegar a plan-engine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

let adminInsertSpy: ReturnType<typeof vi.fn>
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: () => ({ insert: (...a: unknown[]) => { adminInsertSpy(...a); return Promise.resolve({ data: null, error: null }) } }),
  }),
}))

// eslint-disable-next-line import/first
import { executeTool, type ToolExecutionContext } from './tools'

beforeEach(() => {
  adminInsertSpy = vi.fn()
})

function fakeSupabase() {
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: 'plan-x' }, error: null }) }),
      }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
    })),
  } as unknown as ToolExecutionContext['supabase']
}

const validInput = {
  pattern_id: 'three_putt_frequency',
  observation_data: { data_points: 8, metric_value: 2.4, confidence: 0.82 },
  hypothesis: 'Tres putts en 9 de cada 10 rondas — los lags mueren cortos.',
  plan: {
    rule: 'Antes de cada green, lee desde dos lados.',
    metric: 'three_putts_per_round',
    target_value: 1,
    target_op: 'lte',
    duration_days: 21,
  },
}

describe('executeTool save_plan dispatcher', () => {
  it('rechaza pattern_id fuera del enum', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1', sessionId: 's-1' }
    const out = await executeTool('save_plan', { ...validInput, pattern_id: 'foo_bar' }, ctx)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/pattern_id/)
  })

  it('rechaza confidence fuera de [0,1]', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1' }
    const out = await executeTool('save_plan', {
      ...validInput,
      observation_data: { ...validInput.observation_data, confidence: 1.5 },
    }, ctx)
    expect(out.ok).toBe(false)
  })

  it('rechaza hypothesis demasiado corta', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1' }
    const out = await executeTool('save_plan', { ...validInput, hypothesis: 'corto' }, ctx)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/hypothesis/)
  })

  it('rechaza target_op invalido', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1' }
    const out = await executeTool('save_plan', {
      ...validInput,
      plan: { ...validInput.plan, target_op: 'less' },
    }, ctx)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/target_op/)
  })

  it('rechaza duration_days fuera de [7,90]', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1' }
    const out = await executeTool('save_plan', {
      ...validInput,
      plan: { ...validInput.plan, duration_days: 200 },
    }, ctx)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/duration_days/)
  })

  it('rechaza metric fuera del enum', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1' }
    const out = await executeTool('save_plan', {
      ...validInput,
      plan: { ...validInput.plan, metric: 'fairways_hit_pct' },
    }, ctx)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/metric/)
  })

  it('acepta input valido y devuelve plan_id', async () => {
    const ctx = { supabase: fakeSupabase(), userId: 'u-1', sessionId: 's-1' }
    const out = await executeTool('save_plan', validInput, ctx)
    expect(out.ok).toBe(true)
    if (out.ok) {
      const data = out.data as { plan_id: string; summary: string }
      expect(data.plan_id).toBe('plan-x')
      expect(data.summary).toBeTruthy()
    }
  })
})
