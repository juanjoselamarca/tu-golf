/**
 * Logging best-effort de cada llamada a la IA → tabla `ai_usage`.
 * Fire-and-forget: NUNCA bloquea ni rompe el request (mismo patrón que
 * src/golf/coach/v3/retrieval/query-logger.ts). Errores van a captureError.
 *
 * Crea su propio admin client para no ensuciar la firma de callLLM.
 */
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import type { AiEnv, AiSurface, LLMRole } from './types'

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
  /** Usuario que originó la llamada (unit-economics). null = sistema/cron/script. */
  userId?: string | null
  /** Superficie de negocio (coach/import/torneos/…). */
  surface?: AiSurface | null
  /** Sesión del coach (para costo por conversación). null fuera del coach. */
  sessionId?: string | null
  /** Input servido de caché de prompt (Anthropic cache_read_input_tokens). */
  cacheRead?: number
  /** Input escrito a caché de prompt (Anthropic cache_creation_input_tokens). */
  cacheWrite?: number
}

/** Fila lista para `INSERT` en `ai_usage` (snake_case). Pura y testeable. */
export interface AiUsageRow {
  ai_env: AiEnv
  role: LLMRole
  provider: string | null
  model: string | null
  status: AiUsageStatus
  fallback_used: boolean
  attempts: number
  tokens_in: number
  tokens_out: number
  latency_ms: number
  cost_usd: number
  error_kind: AiErrorKind | null
  user_id: string | null
  surface: AiSurface | null
  session_id: string | null
  cache_read_tokens: number
  cache_write_tokens: number
}

/** Mapea un record de dominio a la fila de DB. Sin efectos: testeable directo. */
export function toAiUsageRow(rec: AiUsageRecord): AiUsageRow {
  return {
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
    user_id: rec.userId ?? null,
    surface: rec.surface ?? null,
    session_id: rec.sessionId ?? null,
    cache_read_tokens: rec.cacheRead ?? 0,
    cache_write_tokens: rec.cacheWrite ?? 0,
  }
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
    .insert(toAiUsageRow(rec))
    .then(
      ({ error }: { error: unknown }) => {
        if (error) void captureError(error, { context: 'ai-gateway.usage-log.insert-failed' })
      },
      // La promesa de PostgREST puede RECHAZAR (red caída), no solo resolver con
      // {error}. Sin este handler queda una unhandled rejection. Fire-and-forget:
      // el caller (coach/gateway) nunca se entera.
      (e: unknown) => void captureError(e, { context: 'ai-gateway.usage-log.insert-rejected' }),
    )
}
