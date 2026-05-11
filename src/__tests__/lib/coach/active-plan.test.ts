import { describe, it, expect } from 'vitest';
import { mockSupabase } from '@/__tests__/__helpers/mock-supabase';
import {
  getActivePlan,
  getRecentCompletedPlan,
  getLatestPlanOutcome,
} from '@/lib/coach/active-plan';

describe('getActivePlan', () => {
  it('devuelve null si no hay plan active', async () => {
    const sb = mockSupabase({ coach_plans: { data: null } });
    const r = await getActivePlan(sb as never, 'u1');
    expect(r).toBeNull();
  });

  it('devuelve el plan active', async () => {
    const sb = mockSupabase({
      coach_plans: {
        data: {
          id: 'p1',
          user_id: 'u1',
          status: 'active',
          pattern_id: 'approach_100_150',
          metric: 'gir_100_150',
          target_value: 0.7,
          target_op: '>=',
          baseline_value: 0.55,
          duration_days: 21,
          created_at: '2026-05-01',
        },
      },
    });
    const r = await getActivePlan(sb as never, 'u1');
    expect(r?.id).toBe('p1');
    expect(r?.status).toBe('active');
  });
});

describe('getRecentCompletedPlan', () => {
  it('devuelve plan resolved en últimos 7 días', async () => {
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    const sb = mockSupabase({
      coach_plans: {
        data: { id: 'p2', user_id: 'u1', status: 'resolved', resolved_at: recent },
      },
    });
    const r = await getRecentCompletedPlan(sb as never, 'u1');
    expect(r?.id).toBe('p2');
  });

  it('devuelve null si no hay plan completed reciente', async () => {
    const sb = mockSupabase({ coach_plans: { data: null } });
    const r = await getRecentCompletedPlan(sb as never, 'u1');
    expect(r).toBeNull();
  });
});

describe('getLatestPlanOutcome', () => {
  it('devuelve el outcome más reciente de un plan', async () => {
    const sb = mockSupabase({
      plan_outcomes: {
        data: {
          id: 42,
          plan_id: 'p1',
          actual_value: 0.78,
          delta_vs_target: 0.08,
          created_at: '2026-05-08',
        },
      },
    });
    const r = await getLatestPlanOutcome(sb as never, 'p1');
    expect(r?.actual_value).toBe(0.78);
    expect(r?.delta_vs_target).toBe(0.08);
  });

  it('devuelve null si el plan no tiene outcomes', async () => {
    const sb = mockSupabase({ plan_outcomes: { data: null } });
    const r = await getLatestPlanOutcome(sb as never, 'p1');
    expect(r).toBeNull();
  });
});
