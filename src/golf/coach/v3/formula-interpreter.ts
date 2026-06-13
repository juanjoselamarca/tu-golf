/**
 * Intérprete declarativo de formula_payload.recipe.
 *
 * Dado un `RunnablePatternDefWithPayload` cuyo `formula_payload` lleva un
 * campo `recipe`, produce la función observadora equivalente a las
 * hardcodeadas en OBSERVE_BY_KEY. Si no hay recipe o el type es desconocido,
 * devuelve null — el caller sigue con `continue`.
 *
 * Nunca lanza. Nunca devuelve NaN/Infinity.
 */
import type { ComputedMetric, RoundData } from '@/golf/coach/metrics'
import { validScores } from '@/golf/coach/metrics'
import type { RunnablePatternDef } from './pattern-runner'

// ── Recipe types ──────────────────────────────────────────────────────────────

export interface HoleFilterAggRecipe {
  type: 'hole_filter_agg'
  filter: { field: 'score' | 'par' | 'over_par'; op: ComparisonOp; value: number }
  scope: 'all' | 'after_first' | 'before_first'
  compute: { metric: 'score' | 'over_par' | 'count'; aggregate: 'avg' | 'sum' | 'pct' }
  min_holes?: number
}

export interface MetadataExtractRecipe {
  type: 'metadata_extract'
  path: string
  mode: 'scalar' | 'array_filter_pct'
  filter?: { op: ComparisonOp; value: number }
  min_count?: number
}

type ComparisonOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
type Recipe = HoleFilterAggRecipe | MetadataExtractRecipe

export interface RunnablePatternDefWithPayload extends RunnablePatternDef {
  formula_payload: Record<string, unknown>
}

// ── Public API ────────────────────────────────────────────────────────────────

export function interpretObserver(
  def: RunnablePatternDefWithPayload,
): ((round: RoundData) => ComputedMetric) | null {
  const payload = def.formula_payload
  if (!payload || typeof payload !== 'object') return null
  const recipe = payload.recipe as Recipe | undefined
  if (!recipe || typeof recipe !== 'object' || !recipe.type) return null

  switch (recipe.type) {
    case 'hole_filter_agg':
      return buildHoleFilterAggObserver(recipe)
    case 'metadata_extract':
      return buildMetadataExtractObserver(recipe)
    default:
      return null
  }
}

// ── hole_filter_agg ───────────────────────────────────────────────────────────

function buildHoleFilterAggObserver(
  recipe: HoleFilterAggRecipe,
): (round: RoundData) => ComputedMetric {
  return (round: RoundData): ComputedMetric => {
    const v = validScores(round)
    if (!v) return { value: null, reason: 'incomplete_round' }

    const { scores, pars: roundPars } = v
    const N = scores.length // always 18

    // 1. Evaluate filter against each hole
    const matches: boolean[] = []
    for (let i = 0; i < N; i++) {
      const fieldValue = resolveField(recipe.filter.field, scores[i], roundPars[i])
      matches.push(compare(fieldValue, recipe.filter.op, recipe.filter.value))
    }

    // 2. Apply scope to get selected hole indices
    const selected = applyScope(matches, recipe.scope, N)

    // 3. Check min_holes
    const minHoles = recipe.min_holes ?? 1
    if (selected.length < minHoles) return { value: null, reason: 'insufficient_holes' }

    // 4. Compute metric + aggregate
    const value = computeAggregate(selected, scores, roundPars, recipe.compute, N)
    if (value === null || !Number.isFinite(value)) return { value: null, reason: 'computation_error' }

    return {
      value: Math.round(value * 1000) / 1000,
      reason: 'computed',
      metadata: { matched_count: selected.length, scope: recipe.scope },
    }
  }
}

function resolveField(field: string, score: number, par: number): number {
  switch (field) {
    case 'score': return score
    case 'par': return par
    case 'over_par': return score - par
    default: return score
  }
}

function compare(a: number, op: ComparisonOp, b: number): boolean {
  switch (op) {
    case 'eq': return a === b
    case 'neq': return a !== b
    case 'gt': return a > b
    case 'gte': return a >= b
    case 'lt': return a < b
    case 'lte': return a <= b
    default: return false
  }
}

function applyScope(matches: boolean[], scope: string, n: number): number[] {
  if (scope === 'all') {
    return matches.reduce<number[]>((acc, m, i) => { if (m) acc.push(i); return acc }, [])
  }

  // Find first matching index
  const firstIdx = matches.indexOf(true)
  if (firstIdx === -1) return []

  if (scope === 'after_first') {
    // All holes AFTER the first trigger (trigger itself excluded)
    const out: number[] = []
    for (let i = firstIdx + 1; i < n; i++) out.push(i)
    return out
  }

  if (scope === 'before_first') {
    const out: number[] = []
    for (let i = 0; i < firstIdx; i++) out.push(i)
    return out
  }

  return []
}

function computeAggregate(
  indices: number[],
  scores: number[],
  roundPars: number[],
  compute: HoleFilterAggRecipe['compute'],
  totalHoles: number,
): number | null {
  if (indices.length === 0) return null

  if (compute.aggregate === 'pct') {
    // For 'count' metric with 'pct': fraction of matching holes over total
    return indices.length / totalHoles
  }

  // Extract the metric values for selected holes
  const values = indices.map((i) => {
    switch (compute.metric) {
      case 'score': return scores[i]
      case 'over_par': return scores[i] - roundPars[i]
      case 'count': return 1
      default: return scores[i]
    }
  })

  switch (compute.aggregate) {
    case 'sum': {
      let s = 0
      for (const v of values) s += v
      return s
    }
    case 'avg': {
      let s = 0
      for (const v of values) s += v
      return s / values.length
    }
    default:
      return null
  }
}

// ── metadata_extract ──────────────────────────────────────────────────────────

function buildMetadataExtractObserver(
  recipe: MetadataExtractRecipe,
): (round: RoundData) => ComputedMetric {
  return (round: RoundData): ComputedMetric => {
    const md = round.metadata
    if (!md || typeof md !== 'object') return { value: null, reason: 'no_metadata' }

    const raw = md[recipe.path]
    if (raw === undefined || raw === null) return { value: null, reason: 'no_metadata_field' }

    if (recipe.mode === 'scalar') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return { value: null, reason: 'invalid_scalar' }
      }
      return { value: raw, reason: 'computed' }
    }

    if (recipe.mode === 'array_filter_pct') {
      if (!Array.isArray(raw)) return { value: null, reason: 'not_array' }
      const nums = raw.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
      const minCount = recipe.min_count ?? 9
      if (nums.length < minCount) return { value: null, reason: 'insufficient_data' }

      if (!recipe.filter) return { value: null, reason: 'missing_filter' }

      let matched = 0
      for (const n of nums) {
        if (compare(n, recipe.filter.op, recipe.filter.value)) matched++
      }
      const pct = Math.round((matched / nums.length) * 10000) / 10000
      return {
        value: pct,
        reason: 'computed',
        metadata: { matched, total: nums.length },
      }
    }

    return { value: null, reason: 'unknown_mode' }
  }
}
