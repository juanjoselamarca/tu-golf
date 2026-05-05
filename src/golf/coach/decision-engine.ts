/**
 * Decision Engine — elige cuál patrón debe convertirse en plan activo.
 *
 * Determinístico: misma entrada → misma salida. Sin LLM en el loop de decisión.
 * El LLM se involucra solo en la asignación del plan (FASE 1A.5.4 — tool save_plan).
 *
 * Ranking:
 *  1) score = severity_weight * confidence
 *  2) tie → más data_points gana
 *  3) tie → patrón más antiguo gana (created_at asc)
 *
 * Supersede: si hay plan activo y otro patrón tiene score > 2x el del actual.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.3
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PATTERNS, type GolfPattern } from './patterns'

const SEVERITY_WEIGHT: Record<GolfPattern['severity'], number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

export interface PatternRow {
  id: string
  pattern_id: string
  confidence: number
  data_points: number
  severity: GolfPattern['severity']
  status: string
  created_at: string
}

export interface ActivePlanLite {
  id: string
  pattern_id: string
  created_at: string
  duration_days: number
}

export interface DecisionInput {
  patterns: PatternRow[]
  activePlan: ActivePlanLite | null
}

export interface DecisionOutput {
  winningPattern: PatternRow | null
  shouldSupersede: boolean
  reason:
    | 'no_active_patterns'
    | 'first_plan'
    | 'plan_still_valid'
    | 'higher_priority_pattern'
    | 'current_pattern_resolved'
}

interface ScoredPattern {
  p: PatternRow
  score: number
}

function scoreAndSort(patterns: PatternRow[]): ScoredPattern[] {
  return patterns
    .map(p => ({ p, score: SEVERITY_WEIGHT[p.severity] * p.confidence }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.p.data_points !== a.p.data_points) return b.p.data_points - a.p.data_points
      return new Date(a.p.created_at).getTime() - new Date(b.p.created_at).getTime()
    })
}

export function decide(input: DecisionInput): DecisionOutput {
  const { patterns, activePlan } = input
  if (patterns.length === 0) {
    return { winningPattern: null, shouldSupersede: false, reason: 'no_active_patterns' }
  }

  const scored = scoreAndSort(patterns)
  const winner = scored[0].p

  if (!activePlan) {
    return { winningPattern: winner, shouldSupersede: false, reason: 'first_plan' }
  }

  const currentScored = scored.find(s => s.p.pattern_id === activePlan.pattern_id)
  if (!currentScored) {
    return { winningPattern: winner, shouldSupersede: true, reason: 'current_pattern_resolved' }
  }

  if (winner.pattern_id !== activePlan.pattern_id && scored[0].score > 2 * currentScored.score) {
    return { winningPattern: winner, shouldSupersede: true, reason: 'higher_priority_pattern' }
  }

  return {
    winningPattern: currentScored.p,
    shouldSupersede: false,
    reason: 'plan_still_valid',
  }
}

/**
 * Lee player_patterns y coach_plans del usuario, enriquece con severity desde
 * el registry, y delega a decide().
 *
 * Inserta `severity` derivado de PATTERNS[pattern_id].severity. Si el patrón
 * fue removido del registry pero la fila quedó en BD, se descarta de la decisión.
 */
export async function decideForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<DecisionOutput> {
  const [patternsRes, planRes] = await Promise.all([
    supabase
      .from('player_patterns')
      .select('id, pattern_type, confidence, data_points, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('coach_plans')
      .select('id, pattern_id, created_at, duration_days')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const rawPatterns = (patternsRes.data ?? []) as Array<{
    id: string
    pattern_type: string
    confidence: number
    data_points: number
    status: string
    created_at: string
  }>

  const enriched: PatternRow[] = rawPatterns
    .map(row => {
      const def = PATTERNS.find(p => p.id === row.pattern_type)
      if (!def) return null
      return {
        id: row.id,
        pattern_id: row.pattern_type,
        confidence: row.confidence,
        data_points: row.data_points,
        severity: def.severity,
        status: row.status,
        created_at: row.created_at,
      } satisfies PatternRow
    })
    .filter((x): x is PatternRow => x !== null)

  const activePlan = (planRes.data as ActivePlanLite | null) ?? null

  return decide({ patterns: enriched, activePlan })
}
