import { describe, it, expect } from 'vitest'
import { createCoachUsageAccumulator, buildCoachUsageRecord } from './usage-accumulator'
import { estimateCostUsd } from '@/lib/ai/costs'

describe('createCoachUsageAccumulator', () => {
  it('arranca en cero', () => {
    const acc = createCoachUsageAccumulator()
    expect(acc.totals()).toEqual({ tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 })
  })

  it('mapea los nombres de campo de Anthropic a TokenUsage', () => {
    const acc = createCoachUsageAccumulator()
    acc.add({
      input_tokens: 100,
      output_tokens: 200,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 1200,
    })
    expect(acc.totals()).toEqual({ tokensIn: 100, tokensOut: 200, cacheRead: 5000, cacheWrite: 1200 })
  })

  it('acumula sobre múltiples llamadas (cada vuelta del tool-loop es una llamada facturada)', () => {
    const acc = createCoachUsageAccumulator()
    acc.add({ input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 100 })
    acc.add({ input_tokens: 5, output_tokens: 30, cache_read_input_tokens: 110, cache_creation_input_tokens: 0 })
    acc.add({ input_tokens: 8, output_tokens: 40, cache_read_input_tokens: 110, cache_creation_input_tokens: 0 })
    expect(acc.totals()).toEqual({ tokensIn: 23, tokensOut: 90, cacheRead: 220, cacheWrite: 100 })
  })

  it('tolera campos de caché ausentes (modelos/turnos sin caché)', () => {
    const acc = createCoachUsageAccumulator()
    acc.add({ input_tokens: 50, output_tokens: 60 })
    expect(acc.totals()).toEqual({ tokensIn: 50, tokensOut: 60, cacheRead: 0, cacheWrite: 0 })
  })

  it('ignora usage null/undefined sin romper (stream que no expuso usage)', () => {
    const acc = createCoachUsageAccumulator()
    acc.add(null)
    acc.add(undefined)
    acc.add({ input_tokens: 7, output_tokens: 9 })
    expect(acc.totals()).toEqual({ tokensIn: 7, tokensOut: 9, cacheRead: 0, cacheWrite: 0 })
  })

  it('hasUsage refleja si hubo algún token contabilizado', () => {
    const acc = createCoachUsageAccumulator()
    expect(acc.hasUsage()).toBe(false)
    acc.add({ input_tokens: 0, output_tokens: 0 })
    expect(acc.hasUsage()).toBe(false)
    acc.add({ input_tokens: 0, output_tokens: 1 })
    expect(acc.hasUsage()).toBe(true)
  })
})

describe('buildCoachUsageRecord', () => {
  const totals = { tokensIn: 200, tokensOut: 500, cacheRead: 5000, cacheWrite: 1200 }

  it('marca surface coach_chat, provider anthropic, role primary_chat', () => {
    const rec = buildCoachUsageRecord({
      totals,
      model: 'claude-sonnet-4-6',
      aiEnv: 'prod',
      userId: 'user-1',
      sessionId: 'sess-9',
      latencyMs: 3000,
      llmCalls: 3,
    })
    expect(rec.surface).toBe('coach_chat')
    expect(rec.provider).toBe('anthropic')
    expect(rec.role).toBe('primary_chat')
    expect(rec.status).toBe('ok')
    expect(rec.fallbackUsed).toBe(false)
    expect(rec.userId).toBe('user-1')
    expect(rec.sessionId).toBe('sess-9')
    expect(rec.aiEnv).toBe('prod')
    expect(rec.attempts).toBe(3)
    expect(rec.latencyMs).toBe(3000)
  })

  it('propaga los cuatro contadores de tokens', () => {
    const rec = buildCoachUsageRecord({ totals, model: 'claude-sonnet-4-6', aiEnv: 'prod', userId: 'u', latencyMs: 0, llmCalls: 1 })
    expect(rec.tokensIn).toBe(200)
    expect(rec.tokensOut).toBe(500)
    expect(rec.cacheRead).toBe(5000)
    expect(rec.cacheWrite).toBe(1200)
  })

  it('calcula el costo cache-aware con el modelo dado', () => {
    const rec = buildCoachUsageRecord({ totals, model: 'claude-sonnet-4-6', aiEnv: 'prod', userId: 'u', latencyMs: 0, llmCalls: 1 })
    expect(rec.costUsd).toBeCloseTo(estimateCostUsd('claude-sonnet-4-6', totals), 12)
  })

  it('usa el modelo real para el costo (Fable cuesta más que sonnet con el mismo uso)', () => {
    const sonnet = buildCoachUsageRecord({ totals, model: 'claude-sonnet-4-6', aiEnv: 'prod', userId: 'u', latencyMs: 0, llmCalls: 1 })
    const fable = buildCoachUsageRecord({ totals, model: 'claude-fable-5', aiEnv: 'prod', userId: 'u', latencyMs: 0, llmCalls: 1 })
    expect(fable.costUsd).toBeGreaterThan(sonnet.costUsd)
    expect(fable.model).toBe('claude-fable-5')
  })
})
