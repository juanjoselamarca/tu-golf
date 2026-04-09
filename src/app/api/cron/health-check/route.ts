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
