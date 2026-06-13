import { describe, it, expect } from 'vitest'
import { interpretObserver } from '../formula-interpreter'
import type { RunnablePatternDefWithPayload } from '../formula-interpreter'
import type { RoundData } from '@/golf/coach/metrics'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDef(
  recipe: Record<string, unknown> | undefined,
  overrides?: Partial<RunnablePatternDefWithPayload>,
): RunnablePatternDefWithPayload {
  return {
    id: 'test-id',
    pattern_key: 'test_pattern',
    version: 1,
    formula_kind: 'intra_round',
    status: 'active' as const,
    formula_payload: {
      metric_key: 'test_metric',
      accion: 'test accion',
      min_confidence: 0.5,
      min_sample: 3,
      ...(recipe !== undefined ? { recipe } : {}),
    },
    ...overrides,
  }
}

function makeRound(scores: number[], parsArr?: number[]): RoundData {
  const defaultPars = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
  const p = parsArr ?? defaultPars
  const parObj: Record<string, number> = {}
  for (let i = 0; i < p.length; i++) parObj[String(i + 1)] = p[i]
  return {
    id: 'round-1',
    scores,
    total_gross: scores.reduce((a, b) => a + b, 0),
    par_per_hole: parObj,
    played_at: '2026-01-01',
    metadata: null,
  }
}

// ── Null returns (no recipe / unknown type) ──────────────────────────────────

describe('interpretObserver null returns', () => {
  it('returns null when formula_payload has no recipe', () => {
    const def = makeDef(undefined)
    expect(interpretObserver(def)).toBeNull()
  })

  it('returns null for unknown recipe type', () => {
    const def = makeDef({ type: 'quantum' })
    expect(interpretObserver(def)).toBeNull()
  })

  it('returns null when formula_payload is empty object', () => {
    const def = { ...makeDef(undefined), formula_payload: {} }
    expect(interpretObserver(def)).toBeNull()
  })
})

// ── hole_filter_agg ──────────────────────────────────────────────────────────

describe('hole_filter_agg', () => {
  it('scope=all, avg of score on par-3 holes', () => {
    // Par-3 holes are at indices 2, 6, 11, 15 (0-based, standard pars)
    const scores = [5, 4, 3, 5, 6, 4, 4, 5, 6, 4, 4, 5, 5, 6, 4, 3, 5, 6]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'par', op: 'eq', value: 3 },
      scope: 'all',
      compute: { metric: 'score', aggregate: 'avg' },
    })
    const observe = interpretObserver(def)!
    expect(observe).not.toBeNull()
    const result = observe(makeRound(scores))
    // Par-3 holes: scores[2]=3, scores[6]=4, scores[11]=5, scores[15]=3 → avg = 15/4 = 3.75
    expect(result.value).toBe(3.75)
    expect(result.reason).toBe('computed')
  })

  it('scope=after_first, double-bogey trigger', () => {
    // Hole 4 (index 4, par 5) → score 7 = +2 (double bogey)
    // Holes after: indices 5..17 (13 holes)
    const scores = [4, 4, 3, 4, 7, 5, 4, 5, 6, 5, 5, 4, 5, 6, 5, 4, 5, 6]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 2 },
      scope: 'after_first',
      compute: { metric: 'score', aggregate: 'avg' },
      min_holes: 2,
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    // Holes 5..17: [5,4,5,6,5,5,4,5,6,5,4,5,6] → sum=65, count=13 → avg=5.0
    expect(result.value).toBe(5)
    expect(result.reason).toBe('computed')
    expect(result.metadata?.matched_count).toBe(13)
  })

  it('scope=after_first, no trigger in round → null', () => {
    // All scores are par or better → no double bogey
    const scores = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 2 },
      scope: 'after_first',
      compute: { metric: 'score', aggregate: 'avg' },
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    expect(result.value).toBeNull()
    expect(result.reason).toBe('insufficient_holes')
  })

  it('scope=after_first, trigger on hole 18 → 0 holes after → null', () => {
    const scores = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 7]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 2 },
      scope: 'after_first',
      compute: { metric: 'score', aggregate: 'avg' },
      min_holes: 1,
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    expect(result.value).toBeNull()
  })

  it('scope=before_first', () => {
    // Trigger at index 9 (hole 10, par 4, score 7 = +3)
    const scores = [4, 5, 3, 4, 6, 5, 3, 4, 6, 7, 4, 3, 4, 5, 4, 3, 4, 5]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 3 },
      scope: 'before_first',
      compute: { metric: 'score', aggregate: 'avg' },
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    // Holes 0..8: [4,5,3,4,6,5,3,4,6] → sum=40, count=9 → avg=4.444
    expect(result.value).toBeCloseTo(4.444, 2)
  })

  it('min_holes not met → null', () => {
    // Only 1 hole after trigger, but min_holes=2
    // Trigger at index 16 (hole 17)
    const scores = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 7, 5]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 4 },
      scope: 'after_first',
      compute: { metric: 'score', aggregate: 'avg' },
      min_holes: 2,
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    expect(result.value).toBeNull()
    expect(result.reason).toBe('insufficient_holes')
  })

  it('over_par aggregate', () => {
    // All par-5 holes, compute avg over_par
    const scores = [4, 4, 3, 4, 7, 4, 3, 4, 8, 4, 4, 3, 4, 6, 4, 3, 4, 5]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'par', op: 'eq', value: 5 },
      scope: 'all',
      compute: { metric: 'over_par', aggregate: 'avg' },
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    // Par-5 holes: indices 4(+2), 8(+3), 13(+1), 17(0) → avg = 6/4 = 1.5
    expect(result.value).toBe(1.5)
  })

  it('pct aggregate con metric no-count → null (guard I-1)', () => {
    const scores = [5, 4, 4, 5, 6, 5, 4, 5, 6, 5, 5, 4, 5, 6, 5, 4, 5, 6]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 1 },
      scope: 'all',
      compute: { metric: 'score', aggregate: 'pct' },
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    expect(result.value).toBeNull()
    expect(result.reason).toBe('computation_error')
  })

  it('pct aggregate', () => {
    // Count fraction of holes with bogey or worse
    const scores = [5, 4, 4, 5, 6, 5, 4, 5, 6, 5, 5, 4, 5, 6, 5, 4, 5, 6]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'over_par', op: 'gte', value: 1 },
      scope: 'all',
      compute: { metric: 'count', aggregate: 'pct' },
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    // Bogey+: indices where over_par >= 1
    // pars: [4,4,3,4,5,4,3,4,5,4,4,3,4,5,4,3,4,5]
    // over_par: [1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1] → 17/18
    expect(result.value).toBeCloseTo(17 / 18, 3)
  })

  it('null scores → null', () => {
    const round: RoundData = {
      id: 'r1',
      scores: null,
      total_gross: null,
      par_per_hole: {},
      played_at: '2026-01-01',
      metadata: null,
    }
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'par', op: 'eq', value: 3 },
      scope: 'all',
      compute: { metric: 'score', aggregate: 'avg' },
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    expect(result.value).toBeNull()
  })

  it('9-hole round → null (validScores requires 18)', () => {
    const scores = [4, 4, 3, 4, 5, 4, 3, 4, 5]
    const def = makeDef({
      type: 'hole_filter_agg',
      filter: { field: 'par', op: 'eq', value: 3 },
      scope: 'all',
      compute: { metric: 'score', aggregate: 'avg' },
    })
    const observe = interpretObserver(def)!
    const result = observe(makeRound(scores))
    expect(result.value).toBeNull()
  })
})

// ── metadata_extract ─────────────────────────────────────────────────────────

describe('metadata_extract', () => {
  it('scalar mode', () => {
    const round = makeRound([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5])
    round.metadata = { driving_accuracy: 0.72 }
    const def = makeDef({
      type: 'metadata_extract',
      path: 'driving_accuracy',
      mode: 'scalar',
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    expect(result.value).toBe(0.72)
  })

  it('array_filter_pct (three-putt equivalent)', () => {
    const round = makeRound([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5])
    round.metadata = { putts: [2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] }
    const def = makeDef({
      type: 'metadata_extract',
      path: 'putts',
      mode: 'array_filter_pct',
      filter: { op: 'gte', value: 3 },
      min_count: 9,
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    // 2 out of 18 putts >= 3 → 2/18 ≈ 0.1111
    expect(result.value).toBeCloseTo(2 / 18, 3)
    expect(result.metadata?.matched).toBe(2)
    expect(result.metadata?.total).toBe(18)
  })

  it('array with min_count not met → null', () => {
    const round = makeRound([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5])
    round.metadata = { putts: [2, 3] }
    const def = makeDef({
      type: 'metadata_extract',
      path: 'putts',
      mode: 'array_filter_pct',
      filter: { op: 'gte', value: 3 },
      min_count: 9,
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    expect(result.value).toBeNull()
    expect(result.reason).toBe('insufficient_data')
  })

  it('missing metadata field → null', () => {
    const round = makeRound([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5])
    round.metadata = {}
    const def = makeDef({
      type: 'metadata_extract',
      path: 'nonexistent',
      mode: 'scalar',
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    expect(result.value).toBeNull()
  })

  it('9-hole round with metadata → value extraído (diseño: metadata es round-level)', () => {
    const round: RoundData = {
      id: 'r-9h',
      scores: [4, 4, 3, 4, 5, 4, 3, 4, 5],
      total_gross: 36,
      par_per_hole: {},
      played_at: '2026-01-01',
      metadata: { driving_accuracy: 0.65 },
    }
    const def = makeDef({
      type: 'metadata_extract',
      path: 'driving_accuracy',
      mode: 'scalar',
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    expect(result.value).toBe(0.65)
  })

  it('null metadata → null', () => {
    const round = makeRound([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5])
    const def = makeDef({
      type: 'metadata_extract',
      path: 'x',
      mode: 'scalar',
    })
    const observe = interpretObserver(def)!
    const result = observe(round)
    expect(result.value).toBeNull()
  })
})

// ── Totality property test ───────────────────────────────────────────────────

describe('totality: never NaN/Infinity/throw', () => {
  const recipes = [
    { type: 'hole_filter_agg', filter: { field: 'over_par', op: 'gte', value: 2 }, scope: 'after_first', compute: { metric: 'score', aggregate: 'avg' }, min_holes: 1 },
    { type: 'hole_filter_agg', filter: { field: 'par', op: 'eq', value: 3 }, scope: 'all', compute: { metric: 'over_par', aggregate: 'sum' } },
    { type: 'hole_filter_agg', filter: { field: 'score', op: 'gt', value: 5 }, scope: 'before_first', compute: { metric: 'count', aggregate: 'pct' } },
    { type: 'metadata_extract', path: 'putts', mode: 'scalar' },
    { type: 'metadata_extract', path: 'putts', mode: 'array_filter_pct', filter: { op: 'gte', value: 3 }, min_count: 1 },
  ]

  const rounds: RoundData[] = [
    makeRound([4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]),
    makeRound([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]),
    makeRound([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    { id: 'empty', scores: null, total_gross: null, par_per_hole: {}, played_at: '2026-01-01', metadata: null },
    { id: 'short', scores: [4, 4, 3], total_gross: 11, par_per_hole: {}, played_at: '2026-01-01', metadata: { putts: [2, 3, 1] } },
    { id: 'meta', scores: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5], total_gross: 72, par_per_hole: {}, played_at: '2026-01-01', metadata: { putts: [2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] } },
  ]

  for (const recipe of recipes) {
    for (const round of rounds) {
      it(`recipe=${recipe.type}/${(recipe as { scope?: string }).scope ?? (recipe as { mode?: string }).mode} × round=${round.id} → well-formed`, () => {
        const def = makeDef(recipe as Record<string, unknown>)
        const observe = interpretObserver(def)
        if (!observe) return // null = valid
        const result = observe(round)
        expect(result).toBeDefined()
        if (result.value !== null) {
          expect(Number.isFinite(result.value)).toBe(true)
        }
        expect(typeof result.reason).toBe('string')
      })
    }
  }
})
