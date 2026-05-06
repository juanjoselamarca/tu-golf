/**
 * Agent Health endpoint — el cerebro de tAIger+ visto como AGENTE,
 * no como vista por usuario. Para auditar fallas y aciertos del coach.
 *
 * Ventana: ultimos 30 dias (hardcoded en MVP, mover a query param luego).
 *
 * Solo admin. GET /api/admin/taiger/agent-health
 *
 * Spec: solicitud de Juanjo 2026-05-05 — "quiero ver el cerebro de
 * tAIger para ver sus fallas y aciertos".
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WINDOW_DAYS = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString()

  // Pull todos los eventos en la ventana (max 5000 para no saturar; si crece,
  // pasar a vistas materializadas).
  const { data: events, error: evErr } = await admin
    .from('coach_events')
    .select('id, user_id, type, payload, related_session_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })

  type Evt = {
    id: number
    user_id: string
    type: string
    payload: Record<string, unknown>
    related_session_id: string | null
    created_at: string
  }
  const evs = (events ?? []) as Evt[]

  // -------- Hallucination stats --------
  const halluEvts = evs.filter(e => e.type === 'hallucination_check')
  const halluFlagged = halluEvts.filter(e => Boolean(e.payload?.flagged))
  const flaggedByKind: Record<string, number> = {}
  for (const e of halluFlagged) {
    const warnings = (e.payload?.warnings as Array<{ kind: string }>) ?? []
    for (const w of warnings) flaggedByKind[w.kind] = (flaggedByKind[w.kind] ?? 0) + 1
  }
  const halluRate = halluEvts.length > 0 ? halluFlagged.length / halluEvts.length : 0
  const recentFlagged = halluFlagged.slice(0, 20).map(e => ({
    id: e.id,
    user_id: e.user_id,
    created_at: e.created_at,
    related_session_id: e.related_session_id,
    warnings: (e.payload?.warnings as unknown) ?? [],
    total_numbers_checked: e.payload?.total_numbers_checked ?? 0,
    total_courses_checked: e.payload?.total_courses_checked ?? 0,
    response_length: e.payload?.response_length ?? 0,
    tool_calls_in_session: e.payload?.tool_calls_in_session ?? 0,
  }))

  // -------- Tool usage --------
  const toolEvts = evs.filter(e => e.type === 'tool_called')
  const toolCount: Record<string, { ok: number; fail: number; avg_ms: number }> = {}
  const msAcc: Record<string, number[]> = {}
  for (const e of toolEvts) {
    const name = (e.payload?.tool_name as string) ?? 'unknown'
    const ok = Boolean(e.payload?.ok)
    const ms = (e.payload?.ms as number) ?? 0
    if (!toolCount[name]) toolCount[name] = { ok: 0, fail: 0, avg_ms: 0 }
    if (!msAcc[name]) msAcc[name] = []
    toolCount[name][ok ? 'ok' : 'fail']++
    msAcc[name].push(ms)
  }
  for (const name of Object.keys(toolCount)) {
    const arr = msAcc[name]
    toolCount[name].avg_ms = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
  }
  const toolUsage = Object.entries(toolCount)
    .map(([name, stats]) => ({
      tool_name: name,
      ok: stats.ok,
      fail: stats.fail,
      total: stats.ok + stats.fail,
      fail_rate: stats.ok + stats.fail > 0 ? stats.fail / (stats.ok + stats.fail) : 0,
      avg_ms: Math.round(stats.avg_ms),
    }))
    .sort((a, b) => b.total - a.total)

  const totalToolCalls = toolEvts.length

  // -------- Plan engagement (save_plan) vs Shadow extractor --------
  const planAssigned = evs.filter(e => e.type === 'plan_assigned').length
  const planSuperseded = evs.filter(e => e.type === 'plan_superseded').length
  const planResolved = evs.filter(e => e.type === 'plan_resolved').length

  const shadowEvts = evs.filter(e => e.type === 'extractor_shadow')
  const shadowDetected = shadowEvts.filter(e => ((e.payload?.regex_extracted_count as number) ?? 0) > 0)

  // Divergencia: shadow detecto recomendaciones EN UNA SESION pero save_plan
  // NO se llamo en esa misma sesion → señal de que el coach hablo del plan
  // pero no lo comprometio.
  const sessionsWithShadow = new Set(
    shadowDetected.map(e => e.related_session_id).filter((s): s is string => !!s),
  )
  const sessionsWithSavePlan = new Set(
    evs.filter(e => e.type === 'plan_assigned').map(e => e.related_session_id).filter((s): s is string => !!s),
  )
  const divergentSessions = Array.from(sessionsWithShadow).filter(s => !sessionsWithSavePlan.has(s))

  // -------- Outcomes con compliance unknown --------
  const planOutcomeEvts = evs.filter(e => e.type === 'plan_outcome')
  const unknownOutcomes = planOutcomeEvts.filter(e => e.payload?.compliance === 'unknown')
  const unknownByMetric: Record<string, number> = {}
  for (const e of unknownOutcomes) {
    const m = (e.payload?.metric as string) ?? 'unknown'
    unknownByMetric[m] = (unknownByMetric[m] ?? 0) + 1
  }

  // -------- Tasa de tool calling por mensaje (heuristica) --------
  // session_message events no se emiten todavia; aproximamos con
  // cantidad_de_hallucination_check (que es 1 por respuesta del LLM).
  const totalResponses = halluEvts.length // 1 hallucination_check por respuesta
  const responsesWithTool = totalResponses > 0
    ? halluEvts.filter(e => ((e.payload?.tool_calls_in_session as number) ?? 0) > 0).length
    : 0
  const toolUsagePerResponse = totalResponses > 0
    ? toolEvts.length / totalResponses
    : 0

  return NextResponse.json({
    window_days: WINDOW_DAYS,
    generated_at: new Date().toISOString(),
    totals: {
      events_in_window: evs.length,
      total_responses: totalResponses,
      responses_with_tool_call: responsesWithTool,
      response_with_tool_rate: totalResponses > 0 ? responsesWithTool / totalResponses : 0,
      avg_tool_calls_per_response: toolUsagePerResponse,
    },
    hallucination: {
      total_checks: halluEvts.length,
      flagged: halluFlagged.length,
      flagged_rate: halluRate,
      flagged_by_kind: flaggedByKind,
      recent_flagged: recentFlagged,
    },
    tool_usage: {
      total_calls: totalToolCalls,
      by_tool: toolUsage,
    },
    plan_engagement: {
      save_plan_calls: planAssigned,
      planes_superseded: planSuperseded,
      planes_resolved: planResolved,
      shadow_detections: shadowDetected.length,
      shadow_total_runs: shadowEvts.length,
      sessions_with_shadow: sessionsWithShadow.size,
      sessions_with_save_plan: sessionsWithSavePlan.size,
      divergent_sessions: divergentSessions.length,
      divergence_rate: sessionsWithShadow.size > 0
        ? divergentSessions.length / sessionsWithShadow.size
        : 0,
    },
    metric_gaps: {
      unknown_outcomes: unknownOutcomes.length,
      total_outcomes: planOutcomeEvts.length,
      unknown_rate: planOutcomeEvts.length > 0
        ? unknownOutcomes.length / planOutcomeEvts.length
        : 0,
      unknown_by_metric: unknownByMetric,
    },
  })
}
