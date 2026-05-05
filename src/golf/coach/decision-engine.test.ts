import { describe, it, expect } from 'vitest'
import { decide, type PatternRow, type ActivePlanLite } from './decision-engine'

function pat(
  pattern_id: string,
  severity: PatternRow['severity'],
  confidence: number,
  data_points = 10,
  created_at = '2026-01-01T00:00:00Z',
): PatternRow {
  return {
    id: `row-${pattern_id}-${created_at}`,
    pattern_id,
    confidence,
    data_points,
    severity,
    status: 'active',
    created_at,
  }
}

function plan(pattern_id: string, created_at = '2026-02-01T00:00:00Z'): ActivePlanLite {
  return { id: 'plan-1', pattern_id, created_at, duration_days: 21 }
}

describe('decide', () => {
  it('no_active_patterns when patterns array is empty', () => {
    const out = decide({ patterns: [], activePlan: null })
    expect(out.winningPattern).toBeNull()
    expect(out.shouldSupersede).toBe(false)
    expect(out.reason).toBe('no_active_patterns')
  })

  it('first_plan when there is no active plan and at least one pattern', () => {
    const a = pat('back_nine_collapse', 'warning', 0.7)
    const b = pat('first_hole_anxiety', 'critical', 0.6)
    const out = decide({ patterns: [a, b], activePlan: null })
    expect(out.shouldSupersede).toBe(false)
    expect(out.reason).toBe('first_plan')
    // critical (3) * 0.6 = 1.8 vs warning (2) * 0.7 = 1.4 → critical gana
    expect(out.winningPattern?.pattern_id).toBe('first_hole_anxiety')
  })

  it('ranks by severity * confidence (critical > warning > info)', () => {
    const winner = pat('first_hole_anxiety', 'critical', 0.5) // 1.5
    const loserHighConf = pat('back_nine_collapse', 'info', 0.95) // 0.95
    const out = decide({ patterns: [loserHighConf, winner], activePlan: null })
    expect(out.winningPattern?.pattern_id).toBe('first_hole_anxiety')
  })

  it('breaks tie on equal score by data_points desc', () => {
    // Both score = warning (2) * 0.5 = 1.0
    const fewer = pat('a', 'warning', 0.5, 5, '2026-01-01T00:00:00Z')
    const more = pat('b', 'warning', 0.5, 50, '2026-01-02T00:00:00Z')
    const out = decide({ patterns: [fewer, more], activePlan: null })
    expect(out.winningPattern?.pattern_id).toBe('b')
  })

  it('breaks tie on equal score and data_points by created_at asc (older wins)', () => {
    const newer = pat('a', 'warning', 0.5, 10, '2026-02-01T00:00:00Z')
    const older = pat('b', 'warning', 0.5, 10, '2026-01-01T00:00:00Z')
    const out = decide({ patterns: [newer, older], activePlan: null })
    expect(out.winningPattern?.pattern_id).toBe('b')
  })

  it('plan_still_valid when active plan pattern is still in the active set and no 2x challenger', () => {
    // current: warning * 0.7 = 1.4 → 2x = 2.8
    // challenger: warning * 0.8 = 1.6 (NOT > 2.8)
    const current = pat('back_nine_collapse', 'warning', 0.7)
    const challenger = pat('first_hole_anxiety', 'warning', 0.8)
    const out = decide({
      patterns: [current, challenger],
      activePlan: plan('back_nine_collapse'),
    })
    expect(out.shouldSupersede).toBe(false)
    expect(out.reason).toBe('plan_still_valid')
    expect(out.winningPattern?.pattern_id).toBe('back_nine_collapse')
  })

  it('higher_priority_pattern triggers supersede when challenger > 2x current', () => {
    // current: info * 0.4 = 0.4 → 2x = 0.8
    // challenger: critical * 0.9 = 2.7 (> 0.8)
    const current = pat('three_putt_frequency', 'info', 0.4)
    const challenger = pat('first_hole_anxiety', 'critical', 0.9)
    const out = decide({
      patterns: [current, challenger],
      activePlan: plan('three_putt_frequency'),
    })
    expect(out.shouldSupersede).toBe(true)
    expect(out.reason).toBe('higher_priority_pattern')
    expect(out.winningPattern?.pattern_id).toBe('first_hole_anxiety')
  })

  it('current_pattern_resolved when active plan pattern is no longer in active set', () => {
    const other = pat('back_nine_collapse', 'warning', 0.7)
    const out = decide({
      patterns: [other],
      activePlan: plan('first_hole_anxiety'),
    })
    expect(out.shouldSupersede).toBe(true)
    expect(out.reason).toBe('current_pattern_resolved')
    expect(out.winningPattern?.pattern_id).toBe('back_nine_collapse')
  })

  it('does NOT supersede when challenger is exactly 2x (strict greater-than)', () => {
    // current: info * 0.5 = 0.5 → 2x = 1.0
    // challenger: warning * 0.5 = 1.0 (NOT > 1.0)
    const current = pat('three_putt_frequency', 'info', 0.5)
    const challenger = pat('first_hole_anxiety', 'warning', 0.5)
    const out = decide({
      patterns: [current, challenger],
      activePlan: plan('three_putt_frequency'),
    })
    expect(out.shouldSupersede).toBe(false)
    expect(out.reason).toBe('plan_still_valid')
  })

  it('returns winner unchanged when active plan IS the highest-scored pattern', () => {
    const same = pat('first_hole_anxiety', 'critical', 0.9)
    const lower = pat('three_putt_frequency', 'info', 0.5)
    const out = decide({
      patterns: [same, lower],
      activePlan: plan('first_hole_anxiety'),
    })
    expect(out.shouldSupersede).toBe(false)
    expect(out.reason).toBe('plan_still_valid')
    expect(out.winningPattern?.pattern_id).toBe('first_hole_anxiety')
  })
})
