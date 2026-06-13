/**
 * Acumulador de uso de tokens del coach a lo largo de UN turno.
 *
 * El coach (chat-engine.ts) hace varias llamadas facturables por turno: cada
 * vuelta del tool-loop + la regeneración aritmética. Cada llamada del SDK de
 * Anthropic expone `message.usage` con cuatro contadores; este acumulador los
 * suma y los traduce a la forma `TokenUsage` que entiende `estimateCostUsd`.
 *
 * Pura, sin I/O — testeable directo. El logging a `ai_usage` lo hace el caller
 * al cerrar el turno (fire-and-forget).
 *
 * Spec: docs/superpowers/specs/2026-06-11-medicion-costo-ia-design.md §3
 */
import { estimateCostUsd, type TokenUsage } from '@/lib/ai/costs'
import type { AiEnv } from '@/lib/ai/types'
import type { AiUsageRecord } from '@/lib/ai/usage-log'

/** Forma de `message.usage` del SDK de Anthropic (campos de caché opcionales). */
export interface AnthropicUsageLike {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export interface CoachUsageAccumulator {
  /** Suma el usage de una llamada. Tolera null/undefined (stream sin usage). */
  add(usage: AnthropicUsageLike | null | undefined): void
  /** Totales acumulados, en la forma que consume estimateCostUsd. */
  totals(): Required<TokenUsage>
  /** true si se contabilizó algún token (para decidir si vale la pena loguear). */
  hasUsage(): boolean
}

export function createCoachUsageAccumulator(): CoachUsageAccumulator {
  let tokensIn = 0
  let tokensOut = 0
  let cacheRead = 0
  let cacheWrite = 0
  return {
    add(usage) {
      if (!usage) return
      tokensIn += usage.input_tokens ?? 0
      tokensOut += usage.output_tokens ?? 0
      cacheRead += usage.cache_read_input_tokens ?? 0
      cacheWrite += usage.cache_creation_input_tokens ?? 0
    },
    totals() {
      return { tokensIn, tokensOut, cacheRead, cacheWrite }
    },
    hasUsage() {
      return tokensIn + tokensOut + cacheRead + cacheWrite > 0
    },
  }
}

export interface BuildCoachUsageArgs {
  totals: Required<TokenUsage>
  /** Modelo realmente usado (coachModel()) — define la tarifa del costo. */
  model: string
  aiEnv: AiEnv
  userId: string | null
  /** Sesión del coach — para costo por conversación. */
  sessionId?: string | null
  latencyMs: number
  /** Llamadas al LLM en el turno (vueltas del tool-loop + regeneración). */
  llmCalls: number
}

/**
 * Arma el `AiUsageRecord` del turno del coach (path principal Anthropic directo).
 * surface=coach_chat es el corte de negocio; el costo es cache-aware con el modelo
 * real. El caller hace el `logAiUsage` fire-and-forget al cerrar el turno.
 */
export function buildCoachUsageRecord(args: BuildCoachUsageArgs): AiUsageRecord {
  const { totals, model, aiEnv, userId, sessionId, latencyMs, llmCalls } = args
  return {
    aiEnv,
    role: 'primary_chat',
    provider: 'anthropic',
    model,
    status: 'ok',
    fallbackUsed: false,
    attempts: llmCalls,
    tokensIn: totals.tokensIn,
    tokensOut: totals.tokensOut,
    latencyMs,
    costUsd: estimateCostUsd(model, totals),
    errorKind: null,
    userId,
    surface: 'coach_chat',
    sessionId: sessionId ?? null,
    cacheRead: totals.cacheRead,
    cacheWrite: totals.cacheWrite,
  }
}
