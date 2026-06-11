import { describe, it, expect } from 'vitest'
import { computeObservationsForRound, OBSERVE_BY_KEY, type RunnablePatternDef } from '../pattern-runner'
import type { RoundData } from '@/golf/coach/metrics'
import { STANDARD_PARS } from '@/golf/coach/metrics'

// Ronda válida con back9 peor que front9 (para signo) + putts en metadata.
const scores = [4, 4, 3, 4, 5, 4, 3, 4, 5, 6, 6, 5, 6, 7, 6, 5, 6, 7] // front ~par, back alto
const round: RoundData = {
  id: 'round-1', scores, total_gross: 90, par_per_hole: STANDARD_PARS, played_at: '2026-05-01',
  metadata: { putts: [2, 2, 3, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 2] },
}

const defs: RunnablePatternDef[] = [
  { id: 'id-bnc', pattern_key: 'back_nine_collapse', version: 1, formula_kind: 'per_round', status: 'active' },
  { id: 'id-fns', pattern_key: 'front_nine_struggles', version: 1, formula_kind: 'per_round', status: 'active' },
  { id: 'id-3p', pattern_key: 'three_putt_frequency', version: 2, formula_kind: 'per_round', status: 'validating' },
  { id: 'id-drv', pattern_key: 'driving_inconsistency', version: 1, formula_kind: 'cross_round', status: 'active' },
]

describe('computeObservationsForRound — observaciones puras por ronda', () => {
  it('produce un insert por patrón observable con value no-null', () => {
    const obs = computeObservationsForRound(round, 'user-1', defs)
    const keys = obs.map((o) => o.pattern_key)
    expect(keys).toContain('back_nine_collapse')
    expect(keys).toContain('front_nine_struggles')
    expect(keys).toContain('three_putt_frequency')
    // driving_inconsistency NO tiene observador per-ronda (cross_round) → saltada.
    expect(keys).not.toContain('driving_inconsistency')
  })

  it('cada insert lleva pattern_id, pattern_version, round_id, user_id', () => {
    const obs = computeObservationsForRound(round, 'user-1', defs)
    const bnc = obs.find((o) => o.pattern_key === 'back_nine_collapse')!
    expect(bnc).toMatchObject({ pattern_id: 'id-bnc', pattern_version: 1, round_id: 'round-1', user_id: 'user-1' })
    expect(typeof bnc.value).toBe('number')
    const tp = obs.find((o) => o.pattern_key === 'three_putt_frequency')!
    expect(tp.pattern_version).toBe(2) // congela la version del def
  })

  it('front_nine_struggles es el negativo de back_nine_collapse (misma ronda)', () => {
    const obs = computeObservationsForRound(round, 'user-1', defs)
    const bnc = obs.find((o) => o.pattern_key === 'back_nine_collapse')!.value
    const fns = obs.find((o) => o.pattern_key === 'front_nine_struggles')!.value
    expect(fns).toBeCloseTo(-bnc, 6)
  })

  it('salta patrones cuya métrica devuelve null (ronda sin putts → sin three_putt)', () => {
    const noPutts: RoundData = { ...round, metadata: null }
    const obs = computeObservationsForRound(noPutts, 'user-1', defs)
    expect(obs.map((o) => o.pattern_key)).not.toContain('three_putt_frequency')
    // pero las de scores siguen
    expect(obs.map((o) => o.pattern_key)).toContain('back_nine_collapse')
  })

  it('nunca lanza con ronda corrupta (scores null) → []', () => {
    const bad: RoundData = { ...round, scores: null, metadata: null }
    expect(() => computeObservationsForRound(bad, 'u', defs)).not.toThrow()
    expect(computeObservationsForRound(bad, 'u', defs)).toEqual([])
  })

  it('OBSERVE_BY_KEY cubre exactamente los 8 patrones observables', () => {
    expect(Object.keys(OBSERVE_BY_KEY).sort()).toEqual([
      'back_nine_collapse', 'first_hole_anxiety', 'front_nine_struggles', 'par_3_weakness',
      'post_bogey_spiral', 'pressure_deterioration', 'short_game_weakness', 'three_putt_frequency',
    ])
  })
})
