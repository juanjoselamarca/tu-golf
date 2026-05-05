/**
 * Admin Brain endpoint — vista cruda del cerebro de tAIger+ para un usuario.
 *
 * Solo admin (profiles.role='admin'). Devuelve perfil, patrones, planes,
 * outcomes, eventos, sesion y tokens del ultimo mes.
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §6.1
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const userId = params.userId
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 })

  const admin = createAdminClient()

  const [
    profileRes,
    patternsRes,
    activePlanRes,
    pastPlansRes,
    outcomesRes,
    eventsRes,
    sessionRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('id, name, indice, indice_golfers, nivel, created_at')
      .eq('id', userId)
      .maybeSingle(),
    admin.from('player_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    admin.from('coach_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    admin.from('coach_plans')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'active')
      .order('resolved_at', { ascending: false, nullsFirst: false })
      .limit(5),
    admin.from('plan_outcomes')
      .select('*')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(20),
    admin.from('coach_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('taiger_sessions')
      .select('id, session_type, created_at, updated_at, next_focus, messages')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle(),
  ])

  // Tokens last 30 days: estimar de coach_events('session_message', { tokens })
  // Si no hay payload con tokens (todavia no instrumentado), devolver 0.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: monthEvents } = await admin
    .from('coach_events')
    .select('payload')
    .eq('user_id', userId)
    .eq('type', 'session_message')
    .gte('created_at', since)

  let inputTokens = 0
  let outputTokens = 0
  for (const e of monthEvents ?? []) {
    const p = e.payload as { input_tokens?: number; output_tokens?: number } | null
    if (p?.input_tokens) inputTokens += p.input_tokens
    if (p?.output_tokens) outputTokens += p.output_tokens
  }

  // Mensajes ultimos 20 — la sesion es 1 sola por usuario (migracion 017),
  // messages es array JSONB con todo el historial.
  const sessionData = sessionRes.data as { id?: string; messages?: Array<{ role: string; content: string }>; created_at?: string; updated_at?: string; next_focus?: string | null } | null
  const allMessages = Array.isArray(sessionData?.messages) ? sessionData!.messages : []
  const last20Messages = allMessages.slice(-20)

  return NextResponse.json({
    profile: profileRes.data ?? null,
    patterns: patternsRes.data ?? [],
    active_plan: activePlanRes.data ?? null,
    past_plans: pastPlansRes.data ?? [],
    plan_outcomes: outcomesRes.data ?? [],
    events: eventsRes.data ?? [],
    session: sessionData
      ? {
          id: sessionData.id,
          created_at: sessionData.created_at,
          updated_at: sessionData.updated_at,
          next_focus: sessionData.next_focus ?? null,
          message_count: allMessages.length,
          messages: last20Messages,
        }
      : null,
    tokens_last_30_days: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
  })
}
