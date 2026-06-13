import { describe, it, expect } from 'vitest'
import { buildCostSummary, type CostUsageRow } from './cost-summary'

function row(p: Partial<CostUsageRow>): CostUsageRow {
  return {
    created_at: '2026-06-12T10:00:00.000Z',
    ai_env: 'prod',
    surface: 'coach_chat',
    model: 'claude-sonnet-4-6',
    user_id: 'u1',
    session_id: 's1',
    cost_usd: 0,
    tokens_in: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    ...p,
  }
}

describe('buildCostSummary', () => {
  it('separa costo prod de dev', () => {
    const s = buildCostSummary(
      [
        row({ ai_env: 'prod', cost_usd: 1 }),
        row({ ai_env: 'prod', cost_usd: 0.5 }),
        row({ ai_env: 'dev', cost_usd: 9 }),
      ],
      { planPriceUsd: 10, periodDays: 30 },
    )
    expect(s.prodCostUsd).toBeCloseTo(1.5, 6)
    expect(s.devCostUsd).toBeCloseTo(9, 6)
  })

  it('cuenta usuarios activos distintos (solo prod, user_id no nulo) y costo por usuario', () => {
    const s = buildCostSummary(
      [
        row({ user_id: 'a', cost_usd: 2 }),
        row({ user_id: 'b', cost_usd: 4 }),
        row({ user_id: 'a', cost_usd: 2 }),
        row({ user_id: null, cost_usd: 100 }), // sistema/cron → no cuenta como usuario
        row({ ai_env: 'dev', user_id: 'c', cost_usd: 50 }), // dev → excluido
      ],
      { planPriceUsd: 10, periodDays: 30 },
    )
    expect(s.activeUsers).toBe(2)
    // prod total = 2+4+2+100 = 108 ; /2 usuarios = 54
    expect(s.costPerActiveUser).toBeCloseTo(54, 6)
  })

  it('costo por conversación del coach = coach prod ÷ session_id distintos', () => {
    const s = buildCostSummary(
      [
        row({ surface: 'coach_chat', session_id: 's1', cost_usd: 1 }),
        row({ surface: 'coach_chat', session_id: 's1', cost_usd: 1 }), // mismo sesión (2 turnos)
        row({ surface: 'coach_chat', session_id: 's2', cost_usd: 2 }),
        row({ surface: 'tournament_assistant', session_id: null, cost_usd: 5 }), // no coach
      ],
      { planPriceUsd: 10, periodDays: 30 },
    )
    expect(s.coachConversations).toBe(2)
    expect(s.coachCostUsd).toBeCloseTo(4, 6)
    expect(s.costPerCoachConversation).toBeCloseTo(2, 6)
  })

  it('agrupa por surface, modelo y día (prod), ordenado por costo desc', () => {
    const s = buildCostSummary(
      [
        row({ surface: 'coach_chat', model: 'claude-sonnet-4-6', cost_usd: 3, created_at: '2026-06-11T10:00:00Z' }),
        row({ surface: 'import_insight', model: 'gemini-2.5-flash', cost_usd: 1, created_at: '2026-06-12T10:00:00Z' }),
        row({ surface: 'coach_chat', model: 'claude-sonnet-4-6', cost_usd: 2, created_at: '2026-06-12T23:00:00Z' }),
      ],
      { planPriceUsd: 10, periodDays: 30 },
    )
    expect(s.bySurface[0]).toMatchObject({ surface: 'coach_chat', costUsd: 5, calls: 2 })
    expect(s.bySurface[1]).toMatchObject({ surface: 'import_insight', costUsd: 1, calls: 1 })
    expect(s.byModel[0]).toMatchObject({ model: 'claude-sonnet-4-6', costUsd: 5 })
    // dos días distintos
    const days = s.byDay.map((d) => d.day)
    expect(days).toContain('2026-06-11')
    expect(days).toContain('2026-06-12')
  })

  it('top usuarios por costo, máximo 20, descendente', () => {
    const rows: CostUsageRow[] = []
    for (let i = 0; i < 25; i++) rows.push(row({ user_id: `u${i}`, cost_usd: i }))
    const s = buildCostSummary(rows, { planPriceUsd: 10, periodDays: 30 })
    expect(s.topUsers).toHaveLength(20)
    expect(s.topUsers[0]).toMatchObject({ userId: 'u24', costUsd: 24 })
    expect(s.topUsers[0].costUsd).toBeGreaterThanOrEqual(s.topUsers[1].costUsd)
  })

  it('% de input del coach servido por caché', () => {
    const s = buildCostSummary(
      [
        // turno 1: 100 input nuevo, 900 cache_read, 0 cache_write
        row({ surface: 'coach_chat', tokens_in: 100, cache_read_tokens: 900, cache_write_tokens: 0 }),
        // turno 2: 0 input nuevo, 1000 cache_read
        row({ surface: 'coach_chat', tokens_in: 0, cache_read_tokens: 1000, cache_write_tokens: 0 }),
      ],
      { planPriceUsd: 10, periodDays: 30 },
    )
    // cache_read 1900 / (1900 + 100 + 0) = 0.95
    expect(s.coachCacheHitPct).toBeCloseTo(0.95, 6)
  })

  it('margen por usuario = precio del plan − costo por usuario activo', () => {
    const s = buildCostSummary([row({ user_id: 'a', cost_usd: 3 })], { planPriceUsd: 10, periodDays: 30 })
    expect(s.marginPerUser).toBeCloseTo(7, 6)
  })

  it('cost_usd como string (numeric de PostgREST) se parsea', () => {
    const s = buildCostSummary([row({ cost_usd: '1.50' as unknown as number })], { planPriceUsd: 10, periodDays: 30 })
    expect(s.prodCostUsd).toBeCloseTo(1.5, 6)
  })

  it('sin filas no rompe (divisiones por cero → 0)', () => {
    const s = buildCostSummary([], { planPriceUsd: 10, periodDays: 30 })
    expect(s.prodCostUsd).toBe(0)
    expect(s.activeUsers).toBe(0)
    expect(s.costPerActiveUser).toBe(0)
    expect(s.coachConversations).toBe(0)
    expect(s.costPerCoachConversation).toBe(0)
    expect(s.coachCacheHitPct).toBe(0)
  })
})
