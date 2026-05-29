import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../weights', () => ({
  getAllWeights: vi.fn(async () => [
    {
      id: '1',
      parameter_type: 'block',
      parameter_key: 'pga',
      current_weight: 0.35,
      previous_weight: null,
      user_cluster_id: null,
      source: 'seed',
      version: 1,
      locked_until: null,
      last_auto_update_at: null,
      last_manual_override_at: null,
      updated_at: new Date().toISOString(),
    },
  ]),
}))

import { getCachedWeights, invalidateLocal, _resetCacheForTest } from '../weights-cache'

describe('cerebro/weights-cache', () => {
  beforeEach(() => {
    _resetCacheForTest()
  })

  it('primera llamada hace fetch a BD', async () => {
    const { getAllWeights } = await import('../weights')
    const w = await getCachedWeights()
    expect(w).toHaveLength(1)
    expect(getAllWeights).toHaveBeenCalledTimes(1)
  })

  it('llamadas siguientes dentro del TTL devuelven cache (no fetch)', async () => {
    const { getAllWeights } = await import('../weights')
    vi.mocked(getAllWeights).mockClear()
    await getCachedWeights()
    await getCachedWeights()
    await getCachedWeights()
    expect(getAllWeights).toHaveBeenCalledTimes(1)
  })

  it('invalidateLocal fuerza fetch en la siguiente llamada', async () => {
    const { getAllWeights } = await import('../weights')
    vi.mocked(getAllWeights).mockClear()
    await getCachedWeights()
    invalidateLocal()
    await getCachedWeights()
    expect(getAllWeights).toHaveBeenCalledTimes(2)
  })
})
