import { describe, it, expect, vi } from 'vitest'
import { computeObservationsForRound, OBSERVE_BY_KEY, backfillPatternObservations, type RunnablePatternDef } from '../pattern-runner'
import type { RunnablePatternDefWithPayload } from '../formula-interpreter'
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

type RawRound = { id: string; scores: unknown; total_gross: number | null; par_per_hole: unknown; played_at: string; metadata: unknown }
function mockAdmin(opts: {
  defs: unknown[]; rounds: RawRound[]; existing: { pattern_id: string; round_id: string }[]
  defsError?: boolean; onUpsert?: (rows: unknown[]) => void
}) {
  return {
    from(table: string) {
      if (table === 'pattern_definitions') {
        return { select: () => ({ in: () => Promise.resolve({ data: opts.defsError ? null : opts.defs, error: opts.defsError ? { message: 'boom' } : null }) }) }
      }
      if (table === 'historical_rounds') {
        return { select: () => ({ eq: () => Promise.resolve({ data: opts.rounds, error: null }) }) }
      }
      if (table === 'pattern_observations') {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: opts.existing, error: null }) }),
          upsert: (rows: unknown[]) => { opts.onUpsert?.(rows); return Promise.resolve({ error: null }) },
        }
      }
      throw new Error('tabla inesperada: ' + table)
    },
  } as never
}

const rawRound: RawRound = { id: 'round-1', scores, total_gross: 90, par_per_hole: STANDARD_PARS, played_at: '2026-05-01', metadata: { putts: [2, 2, 3, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 2] } }

describe('backfillPatternObservations — orquestador idempotente', () => {
  it('primera corrida: inserta las observaciones computables (incluye defs validating)', async () => {
    let upserted: unknown[] = []
    const admin = mockAdmin({ defs, rounds: [rawRound], existing: [], onUpsert: (r) => { upserted = r } })
    const res = await backfillPatternObservations(admin, 'user-1')
    expect(res.roundsScanned).toBe(1)
    expect(res.patternsRun).toBe(defs.length)
    expect(res.inserted).toBe(3) // bnc + fns + 3p (driving es cross_round)
    expect(upserted).toHaveLength(3)
    const keys = (upserted as { pattern_key: string }[]).map((o) => o.pattern_key)
    expect(keys).toContain('three_putt_frequency') // status validating SÍ se observa
  })

  it('idempotente: si ya están todas observadas → inserted 0, no upsertea', async () => {
    let called = false
    const existing = [
      { pattern_id: 'id-bnc', round_id: 'round-1' },
      { pattern_id: 'id-fns', round_id: 'round-1' },
      { pattern_id: 'id-3p', round_id: 'round-1' },
    ]
    const admin = mockAdmin({ defs, rounds: [rawRound], existing, onUpsert: () => { called = true } })
    const res = await backfillPatternObservations(admin, 'user-1')
    expect(res.inserted).toBe(0)
    expect(called).toBe(false)
  })

  it('propaga el error de query (lo atrapa el try best-effort del caller)', async () => {
    const admin = mockAdmin({ defs, rounds: [rawRound], existing: [], defsError: true })
    await expect(backfillPatternObservations(admin, 'user-1')).rejects.toBeTruthy()
  })
})

// ── Integración: patrones declarativos vía interpretObserver ──────────────────

describe('computeObservationsForRound — fallback a interpretObserver para patrones declarativos', () => {
  const declarativeDef: RunnablePatternDefWithPayload = {
    id: 'id-decl',
    pattern_key: 'scoring_after_first_double',
    version: 1,
    formula_kind: 'intra_round',
    status: 'validating',
    formula_payload: {
      metric_key: 'post_double_score_avg',
      accion: 'Reset post-double',
      min_confidence: 0.5,
      min_sample: 3,
      recipe: {
        type: 'hole_filter_agg',
        filter: { field: 'over_par', op: 'gte', value: 2 },
        scope: 'after_first',
        compute: { metric: 'score', aggregate: 'avg' },
        min_holes: 2,
      },
    },
  }

  // Ronda con double bogey en hoyo 5 (index 4, par 5, score 7 = +2)
  const roundWithDouble: RoundData = {
    id: 'round-dbl',
    scores: [4, 4, 3, 4, 7, 5, 4, 5, 6, 5, 5, 4, 5, 6, 5, 4, 5, 6],
    total_gross: 87,
    par_per_hole: STANDARD_PARS,
    played_at: '2026-06-01',
    metadata: null,
  }

  it('patrón declarativo SIN entrada en OBSERVE_BY_KEY produce observación vía interpretObserver', () => {
    // scoring_after_first_double NO está en OBSERVE_BY_KEY
    expect(OBSERVE_BY_KEY['scoring_after_first_double']).toBeUndefined()
    const obs = computeObservationsForRound(roundWithDouble, 'user-1', [declarativeDef])
    expect(obs).toHaveLength(1)
    expect(obs[0].pattern_key).toBe('scoring_after_first_double')
    expect(obs[0].value).toBe(5) // avg de hoyos 5-17
    expect(obs[0].pattern_id).toBe('id-decl')
  })

  it('OBSERVE_BY_KEY tiene precedencia sobre interpretObserver', () => {
    // post_bogey_spiral está en OBSERVE_BY_KEY; recipe en payload es ignorada
    const genZeroWithRecipe: RunnablePatternDefWithPayload = {
      id: 'id-pbs',
      pattern_key: 'post_bogey_spiral',
      version: 1,
      formula_kind: 'aggregate',
      status: 'active',
      formula_payload: {
        metric_key: 'post_bogey_score_avg',
        accion: 'Reset post-bogey',
        min_confidence: 0.5,
        min_sample: 3,
        recipe: {
          type: 'hole_filter_agg',
          filter: { field: 'par', op: 'eq', value: 99 },
          scope: 'all',
          compute: { metric: 'score', aggregate: 'avg' },
        },
      },
    }
    const obs = computeObservationsForRound(roundWithDouble, 'user-1', [genZeroWithRecipe])
    // Should use OBSERVE_BY_KEY (computePostBogeyAvg), not the recipe
    expect(obs).toHaveLength(1)
    expect(obs[0].pattern_key).toBe('post_bogey_spiral')
    // If the recipe were used, par=99 would match nothing → null → no observation
    // Having an observation proves OBSERVE_BY_KEY took precedence
  })

  it('patrón sin recipe ni OBSERVE_BY_KEY → saltado', () => {
    const unknownDef: RunnablePatternDefWithPayload = {
      id: 'id-unk',
      pattern_key: 'unknown_pattern',
      version: 1,
      formula_kind: 'multivariate',
      status: 'active',
      formula_payload: { metric_key: 'x', accion: 'x', min_confidence: 0.5, min_sample: 3 },
    }
    const obs = computeObservationsForRound(roundWithDouble, 'user-1', [unknownDef])
    expect(obs).toHaveLength(0)
  })
})
