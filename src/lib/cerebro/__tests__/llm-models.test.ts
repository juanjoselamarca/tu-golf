/**
 * Integration test contra Supabase prod (tabla `llm_models` con seed de Task 7).
 * Skipea graceful si faltan env vars (mismo patrón que weights.test).
 */
import { describe, it, expect } from 'vitest'
import { resolveModelByRole, resolveFallbackChain } from '../llm-models'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const skipIfNoEnv = !url || !serviceKey

describe.skipIf(skipIfNoEnv)('cerebro/llm-models', () => {
  it('devuelve el modelo active para primary_chat', async () => {
    const m = await resolveModelByRole('primary_chat')
    expect(m).not.toBeNull()
    expect(m?.status).toBe('active')
    expect(m?.role).toBe('primary_chat')
  })

  it('devuelve el modelo active para evaluator (haiku)', async () => {
    const m = await resolveModelByRole('evaluator')
    expect(m?.model_id).toContain('haiku')
  })

  it('devuelve null para un rol desconocido', async () => {
    // @ts-expect-error tipo inválido a propósito
    const m = await resolveModelByRole('inexistente')
    expect(m).toBeNull()
  })

  it('resolveFallbackChain devuelve la cadena primary_chat→evaluator', async () => {
    // Seed: primary_chat (sonnet-4-6) → fallback haiku-4-5 (sin fallback más)
    const chain = await resolveFallbackChain('primary_chat')
    expect(chain).toContain('anthropic/claude-sonnet-4-6')
    expect(chain).toContain('anthropic/claude-haiku-4-5')
    expect(chain.length).toBeGreaterThanOrEqual(2)
  })

  it('resolveFallbackChain devuelve [] para rol desconocido', async () => {
    // @ts-expect-error tipo inválido a propósito
    const chain = await resolveFallbackChain('inexistente')
    expect(chain).toEqual([])
  })
})
