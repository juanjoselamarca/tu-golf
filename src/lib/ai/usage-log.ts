/**
 * Logging best-effort de cada llamada a la IA → tabla `ai_usage`.
 * Fire-and-forget: NUNCA bloquea ni rompe el request (mismo patrón que
 * src/golf/coach/v3/retrieval/query-logger.ts). Errores van a captureError.
 *
 * Crea su propio admin client para no ensuciar la firma de callLLM.
 */
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import type { AiEnv, LLMRole } from './types'

export type AiUsageStatus = 'ok' | 'all_failed'
export type AiErrorKind = 'rate_limit' | 'overloaded' | 'timeout' | 'other'

export interface AiUsageRecord {
  aiEnv: AiEnv
  role: LLMRole
  provider: string | null
  model: string | null
  status: AiUsageStatus
  fallbackUsed: boolean
  attempts: number
  tokensIn: number
  tokensOut: number
  latencyMs: number
  costUsd: number
  errorKind: AiErrorKind | null
}

let _enabled = true

/** Test seam: desactiva el logging para que los tests no escriban a la DB. */
export function _setUsageLogEnabledForTests(v: boolean): void {
  _enabled = v
}

/** Inserta un row en `ai_usage`. Fire-and-forget, nunca tira. */
export function logAiUsage(rec: AiUsageRecord): void {
  if (!_enabled) return
  let sb
  try {
    sb = createAdminClient()
  } catch {
    return // sin service-role (ej. contexto sin env) → no-op silencioso
  }
  sb.from('ai_usage')
    .insert({
      ai_env: rec.aiEnv,
      role: rec.role,
      provider: rec.provider,
      model: rec.model,
      status: rec.status,
      fallback_used: rec.fallbackUsed,
      attempts: rec.attempts,
      tokens_in: rec.tokensIn,
      tokens_out: rec.tokensOut,
      latency_ms: rec.latencyMs,
      cost_usd: rec.costUsd,
      error_kind: rec.errorKind,
    })
    .then(({ error }: { error: unknown }) => {
      if (error) void captureError(error, { context: 'ai-gateway.usage-log.insert-failed' })
    })
}
