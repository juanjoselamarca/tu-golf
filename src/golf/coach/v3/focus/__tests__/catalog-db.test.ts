import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadFocusCatalog } from '../catalog-db'
import { FOCUS_CATALOG } from '../catalog'

function fakeClient(result: { data?: unknown; error?: unknown }): SupabaseClient {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) builder[m] = () => builder
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return { from: () => builder } as unknown as SupabaseClient
}

const ROW = (key: string, over: Record<string, unknown> = {}) => ({
  pattern_key: key,
  name: `Nombre ${key}`,
  status: 'active',
  formula_payload: { metric_key: 'post_bogey_score_avg', accion: 'Haz X', min_confidence: 0.55, min_sample: 4 },
  ...over,
})

describe('loadFocusCatalog — catálogo desde pattern_definitions (Ola 3)', () => {
  it('arma candidatos desde la DB ligando la matemática por pattern_key', async () => {
    const c = await loadFocusCatalog(fakeClient({ data: [ROW('post_bogey_spiral')], error: null }))
    expect(c).toHaveLength(1)
    expect(c[0].patternId).toBe('post_bogey_spiral')
    expect(c[0].label).toBe('Nombre post_bogey_spiral')
    expect(c[0].accion).toBe('Haz X')
    expect(c[0].metricKey).toBe('post_bogey_score_avg')
    expect(c[0].minConfidence).toBe(0.55)
    expect(c[0].minSample).toBe(4)
    // la función measure viene del código (gen-0), ligada por key
    expect(typeof c[0].measure).toBe('function')
  })

  it('ignora patrones sin binding de código (declarativo full = Ola 5)', async () => {
    const c = await loadFocusCatalog(
      fakeClient({ data: [ROW('post_bogey_spiral'), ROW('patron_inventado_sin_codigo')], error: null }),
    )
    expect(c.map((x) => x.patternId)).toEqual(['post_bogey_spiral'])
  })

  it('DB vacía → fallback al catálogo de código (nunca deja al coach sin patrones)', async () => {
    const c = await loadFocusCatalog(fakeClient({ data: [], error: null }))
    expect(c).toBe(FOCUS_CATALOG)
  })

  it('error de DB → fallback al catálogo de código', async () => {
    const c = await loadFocusCatalog(fakeClient({ data: null, error: { message: 'boom' } }))
    expect(c).toBe(FOCUS_CATALOG)
  })
})
