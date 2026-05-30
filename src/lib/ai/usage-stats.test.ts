import { describe, it, expect } from 'vitest'
import { evaluateAiAlerts, DEFAULT_THRESHOLDS, type AiUsageStats } from './usage-stats'

function stats(p: Partial<AiUsageStats>): AiUsageStats {
  return {
    windowHours: 24,
    total: 100,
    ok: 100,
    failed: 0,
    fallbackCount: 0,
    rateLimitCount: 0,
    overloadedCount: 0,
    timeoutCount: 0,
    costUsd: 0,
    byProvider: {},
    ...p,
  }
}

describe('evaluateAiAlerts', () => {
  it('todo sano → sin alertas', () => {
    expect(evaluateAiAlerts(stats({ ok: 100, failed: 0 }))).toEqual([])
  })

  it('no alerta con muestra menor a minSample (ruido)', () => {
    // 2/3 fallaron pero total=3 < minSample → sin alerta
    const s = stats({ total: 3, ok: 1, failed: 2, fallbackCount: 3 })
    expect(evaluateAiAlerts(s)).toEqual([])
  })

  it('failRate alto → alerta crítica', () => {
    const s = stats({ total: 100, ok: 90, failed: 10 }) // 10% > 5%
    const alerts = evaluateAiAlerts(s)
    expect(alerts.some((a) => a.code === 'ai_fail_rate_high' && a.level === 'critical')).toBe(true)
  })

  it('fallbackRate alto → warning (Anthropic degradado)', () => {
    const s = stats({ total: 100, ok: 100, failed: 0, fallbackCount: 40 }) // 40% > 25%
    const alerts = evaluateAiAlerts(s)
    expect(alerts.some((a) => a.code === 'ai_fallback_rate_high' && a.level === 'warning')).toBe(true)
  })

  it('rateLimitCount alto → warning de límite de tier', () => {
    const s = stats({ total: 100, rateLimitCount: 30 }) // > 20
    const alerts = evaluateAiAlerts(s)
    expect(alerts.some((a) => a.code === 'ai_rate_limit_frequent')).toBe(true)
  })

  it('el escenario del incidente (519 rate-limits) dispararía alerta', () => {
    const s = stats({ total: 600, ok: 81, failed: 519, fallbackCount: 519, rateLimitCount: 519 })
    const codes = evaluateAiAlerts(s).map((a) => a.code)
    expect(codes).toContain('ai_fail_rate_high')
    expect(codes).toContain('ai_fallback_rate_high')
    expect(codes).toContain('ai_rate_limit_frequent')
  })

  it('respeta thresholds custom', () => {
    const s = stats({ total: 100, fallbackCount: 30 })
    // con threshold 0.5, 30% no alerta
    const alerts = evaluateAiAlerts(s, { ...DEFAULT_THRESHOLDS, fallbackRate: 0.5 })
    expect(alerts.some((a) => a.code === 'ai_fallback_rate_high')).toBe(false)
  })
})
