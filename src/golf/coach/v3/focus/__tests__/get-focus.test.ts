import { describe, it, expect } from 'vitest'
import { getFocus, type GetFocusDeps } from '../get-focus'
import { normalizeScores } from '@/lib/data/focus'
import { spiralRound } from './select-focus.test'
import type { CerebroWeight } from '@/lib/cerebro/weights'

function patternW(key: string, weight: number): CerebroWeight {
  return {
    id: `w-${key}`,
    parameter_type: 'pattern',
    parameter_key: key,
    current_weight: weight,
    previous_weight: null,
    user_cluster_id: null,
    source: 'manual',
    version: 1,
    locked_until: null,
    last_auto_update_at: null,
    last_manual_override_at: null,
    updated_at: '2026-06-02T00:00:00Z',
  }
}

describe('getFocus — orquestación con dependencias inyectadas', () => {
  const rounds = [spiralRound('r1'), spiralRound('r2'), spiralRound('r3'), spiralRound('r4')]

  function deps(over: Partial<GetFocusDeps> = {}): GetFocusDeps {
    return {
      loadRounds: async () => rounds,
      loadTarget: async () => ({ currentHandicap: 20, targetHandicap: 14, targetDeadline: null }),
      loadWeights: async () => [],
      ...over,
    }
  }

  it('compone historial + target + pesos y delega en selectFocus', async () => {
    const result = await getFocus('user-1', deps())
    expect(result.kind).toBe('focus')
    if (result.kind !== 'focus') throw new Error('unreachable')
    expect(result.patternId).toBe('post_bogey_spiral')
    expect(result.deltaVsTarget).toBeCloseTo(6) // 20 - 14
  })

  it('lee cerebro_weights en runtime (paramétrico vivo): el peso llega al foco', async () => {
    const result = await getFocus(
      'user-1',
      deps({ loadWeights: async () => [patternW('post_bogey_spiral', 0.9)] }),
    )
    if (result.kind !== 'focus') throw new Error('expected focus')
    expect(result.peso).toBe(0.9)
  })

  it('cold start honesto cuando no hay historial', async () => {
    const result = await getFocus('user-1', deps({ loadRounds: async () => [] }))
    expect(result.kind).toBe('fallback')
    if (result.kind !== 'fallback') throw new Error('unreachable')
    expect(result.reason).toBe('cold_start')
    expect(result.handicap).toBe(20)
  })
})

describe('normalizeScores — tolera array y JSONB objeto legacy', () => {
  it('pasa un array tal cual', () => {
    expect(normalizeScores([4, 5, null, 3])).toEqual([4, 5, null, 3])
  })

  it('convierte objeto {"1":4,...} a array por índice de hoyo', () => {
    expect(normalizeScores({ '1': 4, '2': 5, '3': 3 })).toEqual([4, 5, 3])
  })

  it('null/undefined → null', () => {
    expect(normalizeScores(null)).toBeNull()
    expect(normalizeScores(undefined)).toBeNull()
  })
})
