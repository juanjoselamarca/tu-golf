import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOnboardingState, ONBOARDING_SECTION } from '../onboarding'

function fakeTable(result: { data?: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'limit']) b[m] = () => b
  b.single = () => Promise.resolve(result)
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return b
}
function fakeClient(byTable: Record<string, ReturnType<typeof fakeTable>>): SupabaseClient {
  return { from: (t: string) => byTable[t] ?? fakeTable({ data: [], error: null }) } as unknown as SupabaseClient
}

describe('getOnboardingState', () => {
  it('jugador nuevo: sin meta y sin hechos → onboarded false', async () => {
    const s = fakeClient({
      profiles: fakeTable({ data: { target_handicap: null }, error: null }),
      coach_episodic_memory: fakeTable({ data: [], error: null }),
    })
    const st = await getOnboardingState(s, 'u1')
    expect(st.hasTarget).toBe(false)
    expect(st.hasFacts).toBe(false)
    expect(st.onboarded).toBe(false)
  })

  it('con meta fijada → onboarded true', async () => {
    const s = fakeClient({
      profiles: fakeTable({ data: { target_handicap: 12 }, error: null }),
      coach_episodic_memory: fakeTable({ data: [], error: null }),
    })
    const st = await getOnboardingState(s, 'u1')
    expect(st.onboarded).toBe(true)
  })

  it('con al menos un hecho guardado → onboarded true', async () => {
    const s = fakeClient({
      profiles: fakeTable({ data: { target_handicap: null }, error: null }),
      coach_episodic_memory: fakeTable({ data: [{ id: 'f1' }], error: null }),
    })
    const st = await getOnboardingState(s, 'u1')
    expect(st.hasFacts).toBe(true)
    expect(st.onboarded).toBe(true)
  })

  it('error leyendo perfil → asume onboarded (no molesta ante la duda)', async () => {
    const s = fakeClient({
      profiles: fakeTable({ data: null, error: { message: 'boom' } }),
      coach_episodic_memory: fakeTable({ data: [], error: null }),
    })
    const st = await getOnboardingState(s, 'u1')
    expect(st.onboarded).toBe(true)
  })
})

describe('ONBOARDING_SECTION', () => {
  it('manda fijar la meta (set_target) y captar la frustración (remember_fact)', () => {
    expect(ONBOARDING_SECTION).toMatch(/set_target/)
    expect(ONBOARDING_SECTION).toMatch(/remember_fact/)
    expect(ONBOARDING_SECTION).toMatch(/meta/i)
    expect(ONBOARDING_SECTION).toMatch(/frustraci[oó]n/i)
  })

  it('cada pregunta se gana el lugar y pasa a dar valor (get_focus)', () => {
    expect(ONBOARDING_SECTION).toMatch(/se gana el lugar/i)
    expect(ONBOARDING_SECTION).toMatch(/get_focus/)
  })
})
