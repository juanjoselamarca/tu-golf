import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { setTarget, rememberFact, recallFacts, getFocusTool, getProgress } from '../focus-tools'
import type { GetFocusDeps } from '@/golf/coach/v3/focus'
import { FOCUS_CATALOG } from '@/golf/coach/v3/focus/catalog'
import { spiralRound } from '@/golf/coach/v3/focus/__tests__/fixtures'

/** Fake encadenable de Supabase: cualquier cadena resuelve al `result` dado y
 * captura los payloads de insert/update para aserciones. */
function fakeTable(result: { data?: unknown; error?: unknown }, capture?: { calls: unknown[] }) {
  const builder: Record<string, unknown> = {}
  const passthrough = ['select', 'eq', 'is', 'gt', 'gte', 'lt', 'order', 'limit', 'in']
  for (const m of passthrough) builder[m] = () => builder
  for (const m of ['insert', 'update', 'upsert']) {
    builder[m] = (payload: unknown) => {
      capture?.calls.push(payload)
      return builder
    }
  }
  builder.single = () => Promise.resolve(result)
  builder.maybeSingle = () => Promise.resolve(result)
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return builder
}

function fakeClient(byTable: Record<string, ReturnType<typeof fakeTable>>): SupabaseClient {
  return {
    from: (t: string) => byTable[t] ?? fakeTable({ data: [], error: null }),
    // rpc devuelve un thenable (como PostgrestFilterBuilder) para restamp de target.
    rpc: () => ({
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(res, rej),
    }),
  } as unknown as SupabaseClient
}

const ctx = (supabase: SupabaseClient) => ({
  supabase,
  userId: 'user-1',
  sessionId: 'sess-1',
})

describe('set_target', () => {
  it('rechaza handicap no numérico o fuera de rango', async () => {
    const admin = fakeClient({})
    expect((await setTarget(ctx(fakeClient({})), { handicap: 'doce' }, admin)).ok).toBe(false)
    expect((await setTarget(ctx(fakeClient({})), { handicap: 99 }, admin)).ok).toBe(false)
    expect((await setTarget(ctx(fakeClient({})), { handicap: -20 }, admin)).ok).toBe(false)
  })

  it('rechaza deadline con formato inválido', async () => {
    const admin = fakeClient({})
    const r = await setTarget(ctx(fakeClient({})), { handicap: 12, deadline: '31-12-2026' }, admin)
    expect(r.ok).toBe(false)
  })

  it('persiste target_handicap + deadline + target_set_at', async () => {
    const cap = { calls: [] as unknown[] }
    const admin = fakeClient({ profiles: fakeTable({ error: null }, cap) })
    const r = await setTarget(ctx(fakeClient({})), { handicap: 12.5, deadline: '2026-12-31' }, admin)
    expect(r.ok).toBe(true)
    const payload = cap.calls[0] as Record<string, unknown>
    expect(payload.target_handicap).toBe(12.5)
    expect(payload.target_deadline).toBe('2026-12-31')
    expect(payload.target_set_at).toBeTypeOf('string')
  })
})

describe('remember_fact', () => {
  it('rechaza fact o category vacíos', async () => {
    const admin = fakeClient({})
    expect((await rememberFact(ctx(fakeClient({})), { category: '', fact: 'x', confidence: 0.8 }, admin)).ok).toBe(false)
    expect((await rememberFact(ctx(fakeClient({})), { category: 'health', fact: '  ', confidence: 0.8 }, admin)).ok).toBe(false)
  })

  it('clampa confidence a [0,1] y guarda source_session_id', async () => {
    const cap = { calls: [] as unknown[] }
    const admin = fakeClient({ coach_episodic_memory: fakeTable({ error: null }, cap) })
    const r = await rememberFact(
      ctx(fakeClient({})),
      { category: 'schedule', fact: 'No juega los lunes', confidence: 1.7 },
      admin,
    )
    expect(r.ok).toBe(true)
    const payload = cap.calls[0] as Record<string, unknown>
    expect(payload.confidence).toBe(1)
    expect(payload.source_session_id).toBe('sess-1')
    expect(payload.category).toBe('schedule')
  })
})

describe('recall_facts', () => {
  it('devuelve los hechos vigentes del jugador', async () => {
    const facts = [{ id: 'f1', category: 'goal', fact: 'Bajar a 12', confidence: 0.9 }]
    const supabase = fakeClient({ coach_episodic_memory: fakeTable({ data: facts, error: null }) })
    const r = await recallFacts(ctx(supabase), {})
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect((r.data as { facts: unknown[] }).facts).toHaveLength(1)
  })
})

describe('get_focus (tool)', () => {
  it('delega en getFocus y devuelve el foco', async () => {
    const deps: GetFocusDeps = {
      loadRounds: async () => [spiralRound('a'), spiralRound('b'), spiralRound('c'), spiralRound('d')],
      loadTarget: async () => ({ currentHandicap: 18, targetHandicap: 12, targetDeadline: null }),
      loadWeights: async () => [],
      loadCatalog: async () => FOCUS_CATALOG,
      loadValidation: async () => ({}),
    }
    const r = await getFocusTool(ctx(fakeClient({})), deps)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect((r.data as { kind: string }).kind).toBe('focus')
  })
})

describe('get_progress', () => {
  it('arma la serie de round_metrics del jugador', async () => {
    const metrics = [
      { strokes_over_par_round: 14, delta_vs_handicap_expected: 2, delta_vs_target_handicap: 4, computed_at: '2026-05-20' },
      { strokes_over_par_round: 12, delta_vs_handicap_expected: 1, delta_vs_target_handicap: 3, computed_at: '2026-05-25' },
    ]
    const supabase = fakeClient({
      round_metrics: fakeTable({ data: metrics, error: null }),
      coach_plans: fakeTable({ data: null, error: null }),
      plan_outcomes: fakeTable({ data: [], error: null }),
    })
    // admin fake para el backfill: sin rondas elegibles → no upsert, no rompe.
    const admin = fakeClient({
      profiles: fakeTable({ data: { indice: 9.6, target_handicap: null }, error: null }),
      historical_rounds: fakeTable({ data: [], error: null }),
    })
    const r = await getProgress(ctx(supabase), admin)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect((r.data as { round_metrics: unknown[] }).round_metrics).toHaveLength(2)
  })
})
