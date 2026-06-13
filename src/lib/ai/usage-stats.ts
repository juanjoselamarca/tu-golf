/**
 * Agregación de `ai_usage` + evaluación de alertas tempranas.
 *
 * `evaluateAiAlerts` es PURA (testeable sin DB). `getAiUsageStats` consulta la
 * tabla. La idea: avisarnos NOSOTROS cuando Anthropic empieza a fallar/throttlear
 * (fallback frecuente, rate-limits) antes de que se vuelva un mail de Anthropic.
 *
 * Spec: docs/superpowers/specs/2026-05-30-ai-gateway-arquitectura-design.md §3.6
 */
import { createAdminClient } from '@/lib/supabaseAdmin'

export interface AiUsageStats {
  windowHours: number
  total: number
  ok: number
  failed: number
  fallbackCount: number
  rateLimitCount: number
  overloadedCount: number
  timeoutCount: number
  costUsd: number
  byProvider: Record<string, number>
}

export interface AiAlert {
  level: 'warning' | 'critical'
  code: string
  message: string
}

export interface AiAlertThresholds {
  /** No alertar con muestra chica (ruido estadístico). */
  minSample: number
  /** all_failed / total por encima de esto → crítico (golfistas quedándose sin IA). */
  failRate: number
  /** fallback_used / total por encima de esto → warning (Anthropic degradado). */
  fallbackRate: number
  /** # de rate_limit en la ventana por encima de esto → warning. */
  rateLimitCount: number
}

export const DEFAULT_THRESHOLDS: AiAlertThresholds = {
  minSample: 10,
  failRate: 0.05,
  fallbackRate: 0.25,
  rateLimitCount: 20,
}

/**
 * Umbral de costo diario de IA (USD) que dispara alerta. Configurable por env
 * `AI_DAILY_COST_ALERT_USD` desde el cron; default conservador para una app que
 * recién mide su gasto. Cierra el loop CERO FALLOS: el credit-out del 11-jun nos
 * agarró ciegos — ahora avisamos NOSOTROS antes de quedarnos sin saldo.
 */
export const DEFAULT_DAILY_COST_THRESHOLD_USD = 5

/**
 * Alerta de costo diario. Pura. `warning` al pasar el umbral, `critical` al
 * triplicarlo (gasto descontrolado — posible loop/abuso/eval contra prod).
 */
export function evaluateDailyCostAlert(
  costUsdToday: number,
  thresholdUsd: number = DEFAULT_DAILY_COST_THRESHOLD_USD,
): AiAlert[] {
  if (costUsdToday <= thresholdUsd) return []
  const critical = costUsdToday > thresholdUsd * 3
  return [
    {
      level: critical ? 'critical' : 'warning',
      code: 'ai_daily_cost_high',
      message: `Costo de IA hoy ~$${costUsdToday.toFixed(2)} supera el umbral de $${thresholdUsd.toFixed(2)}${critical ? ' (3× — gasto descontrolado, revisar YA)' : ''}.`,
    },
  ]
}

/**
 * Evalúa alertas a partir de los stats. Pura: misma entrada, misma salida.
 * Devuelve [] si todo está sano o si la muestra es muy chica.
 */
export function evaluateAiAlerts(
  s: AiUsageStats,
  t: AiAlertThresholds = DEFAULT_THRESHOLDS,
): AiAlert[] {
  const alerts: AiAlert[] = []
  if (s.total < t.minSample) return alerts

  const failRate = s.failed / s.total
  const fallbackRate = s.fallbackCount / s.total

  if (failRate > t.failRate) {
    alerts.push({
      level: 'critical',
      code: 'ai_fail_rate_high',
      message: `Tasa de fallo total de IA ${(failRate * 100).toFixed(1)}% en ${s.windowHours}h (${s.failed}/${s.total}). Golfistas pueden quedarse sin IA.`,
    })
  }
  if (fallbackRate > t.fallbackRate) {
    alerts.push({
      level: 'warning',
      code: 'ai_fallback_rate_high',
      message: `Fallback a Gemini ${(fallbackRate * 100).toFixed(1)}% en ${s.windowHours}h (${s.fallbackCount}/${s.total}). Anthropic está degradado/throttleando.`,
    })
  }
  if (s.rateLimitCount > t.rateLimitCount) {
    alerts.push({
      level: 'warning',
      code: 'ai_rate_limit_frequent',
      message: `${s.rateLimitCount} rate-limits de IA en ${s.windowHours}h. Acercándonos al límite del tier — revisar antes de que degrade el servicio.`,
    })
  }
  return alerts
}

interface UsageRow {
  status: string
  fallback_used: boolean
  error_kind: string | null
  cost_usd: number | string | null
  provider: string | null
}

function aggregate(rows: UsageRow[], windowHours: number): AiUsageStats {
  const stats: AiUsageStats = {
    windowHours,
    total: rows.length,
    ok: 0,
    failed: 0,
    fallbackCount: 0,
    rateLimitCount: 0,
    overloadedCount: 0,
    timeoutCount: 0,
    costUsd: 0,
    byProvider: {},
  }
  for (const r of rows) {
    if (r.status === 'ok') stats.ok++
    else stats.failed++
    if (r.fallback_used) stats.fallbackCount++
    if (r.error_kind === 'rate_limit') stats.rateLimitCount++
    else if (r.error_kind === 'overloaded') stats.overloadedCount++
    else if (r.error_kind === 'timeout') stats.timeoutCount++
    stats.costUsd += Number(r.cost_usd ?? 0)
    if (r.provider) stats.byProvider[r.provider] = (stats.byProvider[r.provider] ?? 0) + 1
  }
  return stats
}

/**
 * Consulta `ai_usage` de las últimas `hours` horas y agrega.
 * Filtra por `aiEnv` (default 'prod') para que las métricas/alertas de
 * producción no se diluyan con tráfico de dev/preview/scripts.
 */
export async function getAiUsageStats(hours = 24, aiEnv = 'prod'): Promise<AiUsageStats> {
  const sb = createAdminClient()
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const { data, error } = await sb
    .from('ai_usage')
    .select('status, fallback_used, error_kind, cost_usd, provider')
    .eq('ai_env', aiEnv)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10_000)
  if (error) throw error
  return aggregate((data ?? []) as UsageRow[], hours)
}
