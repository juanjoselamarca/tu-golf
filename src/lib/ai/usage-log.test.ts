import { describe, it, expect } from 'vitest'
import { toAiUsageRow, type AiUsageRecord } from './usage-log'

const base: AiUsageRecord = {
  aiEnv: 'prod',
  role: 'primary_chat',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  status: 'ok',
  fallbackUsed: false,
  attempts: 1,
  tokensIn: 100,
  tokensOut: 200,
  latencyMs: 1234,
  costUsd: 0.0042,
  errorKind: null,
}

describe('toAiUsageRow — mapeo a fila de ai_usage', () => {
  it('mapea los campos base a snake_case', () => {
    const row = toAiUsageRow(base)
    expect(row).toMatchObject({
      ai_env: 'prod',
      role: 'primary_chat',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      status: 'ok',
      fallback_used: false,
      attempts: 1,
      tokens_in: 100,
      tokens_out: 200,
      latency_ms: 1234,
      cost_usd: 0.0042,
      error_kind: null,
    })
  })

  it('incluye user_id, surface y session_id cuando se pasan', () => {
    const row = toAiUsageRow({ ...base, userId: 'user-abc', surface: 'coach_chat', sessionId: 'sess-1' })
    expect(row.user_id).toBe('user-abc')
    expect(row.surface).toBe('coach_chat')
    expect(row.session_id).toBe('sess-1')
  })

  it('user_id, surface y session_id default a null cuando no se pasan', () => {
    const row = toAiUsageRow(base)
    expect(row.user_id).toBeNull()
    expect(row.surface).toBeNull()
    expect(row.session_id).toBeNull()
  })

  it('cache_read_tokens y cache_write_tokens default a 0', () => {
    const row = toAiUsageRow(base)
    expect(row.cache_read_tokens).toBe(0)
    expect(row.cache_write_tokens).toBe(0)
  })

  it('mapea cacheRead/cacheWrite cuando se pasan', () => {
    const row = toAiUsageRow({ ...base, cacheRead: 5000, cacheWrite: 1200 })
    expect(row.cache_read_tokens).toBe(5000)
    expect(row.cache_write_tokens).toBe(1200)
  })
})
