import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlanExpired, closeExpiredPlans } from '../plan-lifecycle'

describe('isPlanExpired', () => {
  const now = new Date('2026-06-02T00:00:00Z')

  it('vencido: created_at + duration_days < ahora', () => {
    expect(isPlanExpired({ created_at: '2026-05-07T00:00:00Z', duration_days: 21 }, now)).toBe(true)
  })

  it('vigente: dentro de la ventana', () => {
    expect(isPlanExpired({ created_at: '2026-05-25T00:00:00Z', duration_days: 21 }, now)).toBe(false)
  })

  it('justo en el borde (último día) sigue vigente', () => {
    expect(isPlanExpired({ created_at: '2026-05-12T00:00:00Z', duration_days: 21 }, now)).toBe(false)
  })

  it('duration_days nulo → tratado como 0 → vencido apenas creado', () => {
    expect(isPlanExpired({ created_at: '2026-06-01T00:00:00Z', duration_days: null }, now)).toBe(true)
  })
})

// ── Fake encadenable de Supabase ──
function fakeTable(result: { data?: unknown; error?: unknown }, capture?: { updates: unknown[]; inserts: unknown[] }) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) builder[m] = () => builder
  builder.update = (p: unknown) => {
    capture?.updates.push(p)
    return builder
  }
  builder.insert = (p: unknown) => {
    capture?.inserts.push(p)
    return builder
  }
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return builder
}
function fakeClient(byTable: Record<string, ReturnType<typeof fakeTable>>): SupabaseClient {
  return { from: (t: string) => byTable[t] ?? fakeTable({ data: [], error: null }) } as unknown as SupabaseClient
}

describe('closeExpiredPlans', () => {
  const now = new Date('2026-06-02T00:00:00Z')

  it('marca el plan vencido como expired y emite coach_event', async () => {
    const planCap = { updates: [] as unknown[], inserts: [] as unknown[] }
    const evtCap = { updates: [] as unknown[], inserts: [] as unknown[] }
    const supabase = fakeClient({
      coach_plans: fakeTable(
        { data: [{ id: 'p1', created_at: '2026-05-07T00:00:00Z', duration_days: 21 }], error: null },
        planCap,
      ),
    })
    const admin = fakeClient({ coach_events: fakeTable({ error: null }, evtCap) })

    const res = await closeExpiredPlans(supabase, 'u1', admin, now)
    expect(res.expired).toEqual(['p1'])
    expect((planCap.updates[0] as Record<string, unknown>).status).toBe('expired')
    expect((planCap.updates[0] as Record<string, unknown>).resolution_reason).toBe('window_elapsed')
    expect((evtCap.inserts[0] as Record<string, unknown>).type).toBe('plan_expired')
  })

  it('no toca planes vigentes', async () => {
    const planCap = { updates: [] as unknown[], inserts: [] as unknown[] }
    const supabase = fakeClient({
      coach_plans: fakeTable(
        { data: [{ id: 'p2', created_at: '2026-05-28T00:00:00Z', duration_days: 21 }], error: null },
        planCap,
      ),
    })
    const admin = fakeClient({ coach_events: fakeTable({ error: null }) })
    const res = await closeExpiredPlans(supabase, 'u1', admin, now)
    expect(res.expired).toEqual([])
    expect(planCap.updates).toHaveLength(0)
  })

  it('sin planes activos → no-op', async () => {
    const supabase = fakeClient({ coach_plans: fakeTable({ data: [], error: null }) })
    const admin = fakeClient({ coach_events: fakeTable({ error: null }) })
    const res = await closeExpiredPlans(supabase, 'u1', admin, now)
    expect(res.expired).toEqual([])
  })
})
