/**
 * GET /api/admin/taiger/agent-health/event/[id]
 *
 * Detalle expandido de un evento del cerebro: el evento + sesion +
 * último mensaje del LLM (si aplica) + tool calls cercanos. Sirve
 * para el panel lateral de drill-down en la UI.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const eventId = parseInt(params.id, 10)
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: evt, error: eErr } = await admin
    .from('coach_events')
    .select('id, user_id, type, payload, related_session_id, related_plan_id, created_at')
    .eq('id', eventId)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })
  if (!evt) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Sesion + ultimo mensaje del LLM (asistente)
  let lastAssistantMessage: string | null = null
  let lastUserMessage: string | null = null
  let messageCount = 0
  if (evt.related_session_id) {
    const { data: sess } = await admin
      .from('taiger_sessions')
      .select('messages')
      .eq('id', evt.related_session_id)
      .maybeSingle()
    const msgs = Array.isArray(sess?.messages) ? sess!.messages as Array<{ role: string; content: string }> : []
    messageCount = msgs.length
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant' && !lastAssistantMessage) lastAssistantMessage = msgs[i].content
      if (msgs[i].role === 'user' && !lastUserMessage) lastUserMessage = msgs[i].content
      if (lastAssistantMessage && lastUserMessage) break
    }
  }

  // Tool calls cercanos: mismo session_id, ±5 minutos
  let nearbyToolCalls: Array<{ id: number; tool_name: string; ok: boolean; ms: number; created_at: string }> = []
  if (evt.related_session_id) {
    const tStart = new Date(new Date(evt.created_at).getTime() - 5 * 60 * 1000).toISOString()
    const tEnd = new Date(new Date(evt.created_at).getTime() + 5 * 60 * 1000).toISOString()
    const { data: tools } = await admin
      .from('coach_events')
      .select('id, payload, created_at')
      .eq('related_session_id', evt.related_session_id)
      .eq('type', 'tool_called')
      .gte('created_at', tStart)
      .lte('created_at', tEnd)
      .order('created_at', { ascending: true })
    nearbyToolCalls = (tools ?? []).map((t: { id: number; payload: Record<string, unknown>; created_at: string }) => ({
      id: t.id,
      tool_name: (t.payload?.tool_name as string) ?? '?',
      ok: Boolean(t.payload?.ok),
      ms: (t.payload?.ms as number) ?? 0,
      created_at: t.created_at,
    }))
  }

  // Reviews previos para este evento
  const { data: reviews } = await admin
    .from('coach_events')
    .select('id, payload, created_at')
    .eq('type', 'hallucination_review')
    .eq('user_id', evt.user_id)
    .order('created_at', { ascending: false })
  const eventReviews = (reviews ?? [])
    .filter((r: { payload: Record<string, unknown> }) => (r.payload?.target_event_id as number) === eventId)
    .map((r: { id: number; payload: Record<string, unknown>; created_at: string }) => ({
      id: r.id,
      verdict: r.payload?.verdict as string,
      notes: (r.payload?.notes as string) ?? null,
      reviewed_at: r.created_at,
    }))

  return NextResponse.json({
    event: evt,
    session: {
      id: evt.related_session_id,
      message_count: messageCount,
      last_user_message: lastUserMessage,
      last_assistant_message: lastAssistantMessage,
    },
    nearby_tool_calls: nearbyToolCalls,
    reviews: eventReviews,
  })
}
