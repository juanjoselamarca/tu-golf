/**
 * Cron Health Check — ejecuta cada 5 minutos via Vercel Cron
 *
 * SQL para crear la tabla health_check_log (ejecutar en Supabase SQL Editor):
 *
 * CREATE TABLE IF NOT EXISTS health_check_log (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   checked_at TIMESTAMPTZ DEFAULT now() NOT NULL,
 *   status TEXT NOT NULL,
 *   checks JSONB NOT NULL,
 *   duration_ms INTEGER NOT NULL
 * );
 *
 * -- Indice para consultas por fecha
 * CREATE INDEX idx_health_check_log_checked_at ON health_check_log (checked_at DESC);
 *
 * -- RLS: solo lectura para admins, insercion desde service role
 * ALTER TABLE health_check_log ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Service role can insert health checks"
 *   ON health_check_log FOR INSERT
 *   WITH CHECK (true);
 *
 * CREATE POLICY "Admins can read health checks"
 *   ON health_check_log FOR SELECT
 *   USING (
 *     EXISTS (
 *       SELECT 1 FROM profiles
 *       WHERE profiles.id = auth.uid()
 *       AND profiles.role = 'admin'
 *     )
 *   );
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { getAiUsageStats, evaluateAiAlerts, evaluateDailyCostAlert, DEFAULT_DAILY_COST_THRESHOLD_USD } from '@/lib/ai/usage-stats'
import { getCostSummary } from '@/lib/ai/cost-summary'
import { captureError } from '@/lib/error-tracking'
import { sendMessage } from '@/lib/telegram-inbox'

export const dynamic = 'force-dynamic'

interface CheckResult {
  name: string
  ok: boolean
  ms: number
  detail?: string | number | null
}

export async function GET(request: NextRequest) {
  // Verificar auth del cron — CRON_SECRET obligatorio en produccion
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 401 })
  }

  const startTime = Date.now()
  const admin = createAdminClient()
  const checks: CheckResult[] = []

  // 1. Supabase ping
  try {
    const t0 = Date.now()
    const { error } = await admin.from('profiles').select('id').limit(1)
    checks.push({
      name: 'supabase_ping',
      ok: !error,
      ms: Date.now() - t0,
      detail: error?.message || null,
    })
  } catch (e) {
    checks.push({
      name: 'supabase_ping',
      ok: false,
      ms: 0,
      detail: e instanceof Error ? e.message : 'Unknown error',
    })
  }

  // 2. Table counts
  const tables = ['profiles', 'rondas_libres', 'tournaments'] as const
  const countResults = await Promise.all(
    tables.map(async (table) => {
      const t0 = Date.now()
      try {
        const { count, error } = await admin
          .from(table)
          .select('*', { count: 'exact', head: true })
        return {
          name: `count_${table}`,
          ok: !error,
          ms: Date.now() - t0,
          detail: error ? error.message : count,
        } as CheckResult
      } catch (e) {
        return {
          name: `count_${table}`,
          ok: false,
          ms: Date.now() - t0,
          detail: e instanceof Error ? e.message : 'Unknown error',
        } as CheckResult
      }
    })
  )
  checks.push(...countResults)

  // 3. Alerta temprana de IA: ¿Anthropic degradado / acercándonos al rate-limit?
  // Avisarnos NOSOTROS antes de que se vuelva un mail de Anthropic.
  try {
    const t0 = Date.now()
    const aiStats = await getAiUsageStats(24)
    const aiAlerts = evaluateAiAlerts(aiStats)
    checks.push({
      name: 'ai_usage_24h',
      ok: aiAlerts.every((a) => a.level !== 'critical'),
      ms: Date.now() - t0,
      detail: `${aiStats.total} llamadas, ${aiStats.fallbackCount} fallback, ${aiStats.rateLimitCount} rate-limit, ~$${aiStats.costUsd.toFixed(4)}`,
    })
    for (const alert of aiAlerts) {
      void captureError(alert.message, {
        context: `ai-gateway.alert.${alert.code}`,
        level: alert.level === 'critical' ? 'fatal' : 'warning',
      })
    }
    // Notificación proactiva real a Juanjo por Telegram (cron diario → máx 1 aviso/día,
    // sin spam). Best-effort: sendMessage degrada solo si falla.
    const chatId = Number(process.env.TELEGRAM_ALLOWED_CHAT_ID)
    if (aiAlerts.length > 0 && Number.isFinite(chatId)) {
      const body = aiAlerts
        .map((a) => `${a.level === 'critical' ? '🔴' : '🟡'} ${a.message}`)
        .join('\n')
      void sendMessage(chatId, `⚠️ Alerta de IA (Golfers+)\n\n${body}`)
    }
  } catch (e) {
    // La tabla ai_usage puede no existir aún / consulta fallar: no bloquear el cron.
    checks.push({
      name: 'ai_usage_24h',
      ok: true,
      ms: 0,
      detail: e instanceof Error ? `skip: ${e.message}` : 'skip',
    })
  }

  // 4. Alerta de COSTO diario de IA (PR-0 medición). Cierra el loop del credit-out
  // del 11-jun: avisamos NOSOTROS por Telegram si el gasto prod del día pasa el
  // umbral, antes de quedarnos sin saldo. Best-effort, no bloquea el cron.
  try {
    const t0 = Date.now()
    const threshold = Number(process.env.AI_DAILY_COST_ALERT_USD) || DEFAULT_DAILY_COST_THRESHOLD_USD
    const todaySummary = await getCostSummary(1)
    const costAlerts = evaluateDailyCostAlert(todaySummary.prodCostUsd, threshold)
    checks.push({
      name: 'ai_cost_24h',
      ok: costAlerts.every((a) => a.level !== 'critical'),
      ms: Date.now() - t0,
      detail: `~$${todaySummary.prodCostUsd.toFixed(4)} prod (umbral $${threshold}), ${todaySummary.activeUsers} usuarios, ${todaySummary.coachConversations} conversaciones coach`,
    })
    for (const alert of costAlerts) {
      void captureError(alert.message, {
        context: `ai-cost.alert.${alert.code}`,
        level: alert.level === 'critical' ? 'fatal' : 'warning',
      })
    }
    const chatId = Number(process.env.TELEGRAM_ALLOWED_CHAT_ID)
    if (costAlerts.length > 0 && Number.isFinite(chatId)) {
      const body = costAlerts
        .map((a) => `${a.level === 'critical' ? '🔴' : '🟡'} ${a.message}`)
        .join('\n')
      void sendMessage(chatId, `💸 Alerta de COSTO de IA (Golfers+)\n\n${body}`)
    }
  } catch (e) {
    checks.push({
      name: 'ai_cost_24h',
      ok: true,
      ms: 0,
      detail: e instanceof Error ? `skip: ${e.message}` : 'skip',
    })
  }

  const durationMs = Date.now() - startTime
  const allOk = checks.every((c) => c.ok)
  const status = allOk ? 'ok' : 'degraded'

  // Guardar resultado en health_check_log
  try {
    await admin.from('health_check_log').insert({
      status,
      checks,
      duration_ms: durationMs,
    })
  } catch {
    // Si la tabla no existe aun, no bloquear el response
  }

  // Si algo fallo, registrar alerta en analytics_events
  if (!allOk) {
    const failedChecks = checks.filter((c) => !c.ok).map((c) => c.name)
    try {
      await admin.from('analytics_events').insert({
        event_type: 'health_alert',
        metadata: {
          status,
          failed_checks: failedChecks,
          duration_ms: durationMs,
        },
      })
    } catch {
      // No bloquear si analytics falla
    }
  }

  return NextResponse.json(
    {
      status,
      checked_at: new Date().toISOString(),
      duration_ms: durationMs,
      checks,
    },
    { status: allOk ? 200 : 503 }
  )
}
