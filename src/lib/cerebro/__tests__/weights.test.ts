/**
 * Integration test contra Supabase prod (tabla `cerebro_weights`).
 *
 * Memoria `reference_vitest_describe_skipif`: el body de describe.skipIf se
 * evalúa al cargar aunque skip=true. createClient va dentro de beforeAll
 * para evitar crash si faltan env vars en CI.
 *
 * Skipea si NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAllWeights, getWeightByKey, setWeight } from '../weights'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoEnv = !url || !serviceKey

const TEST_KEY = 'test_unit_weights_' + Math.random().toString(36).slice(2, 8)

describe.skipIf(skipIfNoEnv)('cerebro/weights', () => {
  let sb: SupabaseClient

  beforeAll(async () => {
    sb = createClient(url!, serviceKey!)
    await sb.from('cerebro_weights').delete().eq('parameter_key', TEST_KEY)
    await sb.from('cerebro_weights').insert({
      parameter_type: 'block',
      parameter_key: TEST_KEY,
      current_weight: 0.35,
      source: 'seed',
    })
  })

  afterAll(async () => {
    if (sb) await sb.from('cerebro_weights').delete().eq('parameter_key', TEST_KEY)
  })

  it('getAllWeights devuelve la fila seed', async () => {
    const all = await getAllWeights()
    expect(all.some(w => w.parameter_key === TEST_KEY)).toBe(true)
  })

  it('getWeightByKey devuelve el valor correcto', async () => {
    const w = await getWeightByKey('block', TEST_KEY)
    expect(w?.current_weight).toBeCloseTo(0.35)
  })

  it('setWeight actualiza el valor y mueve previous_weight', async () => {
    await setWeight('block', TEST_KEY, 0.42, 'manual')
    const w = await getWeightByKey('block', TEST_KEY)
    expect(w?.current_weight).toBeCloseTo(0.42)
    expect(w?.previous_weight).toBeCloseTo(0.35)
    expect(w?.source).toBe('manual')
  })
})
