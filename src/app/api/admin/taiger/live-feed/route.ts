/**
 * GET /api/admin/taiger/live-feed
 *
 * Feed en vivo de eventos del cerebro de tAIger+. Soporta polling
 * incremental: pasar ?since=<id> para traer solo lo nuevo desde la
 * última request.
 *
 * Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import { narrateEvent } from '@/lib/coach-event-narrator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const sinceParam = req.nextUrl.searchParams.get('since')
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(200, Math.max(1, isNaN(limitParam) ? 50 : limitParam))

  const admin = createAdminClient()

  let query = admin
    .from('coach_events')
    .select('id, user_id, type, payload, related_session_id, related_plan_id, created_at')
    .order('id', { ascending: false })
    .limit(limit)

  if (sinceParam) {
    const sinceId = parseInt(sinceParam, 10)
    if (!isNaN(sinceId) && sinceId > 0) {
      query = query.gt('id', sinceId)
    }
  }

  const { data: events, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolver nombres de usuarios en una sola query
  const userIds = Array.from(new Set((events ?? []).map(e => e.user_id)))
  let nameMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name')
      .in('id', userIds)
    for (const p of profiles ?? []) nameMap[p.id] = p.name ?? 'Sin nombre'
  }

  const items = (events ?? []).map(e => ({
    id: e.id,
    user_id: e.user_id,
    user_name: nameMap[e.user_id] ?? '—',
    type: e.type,
    related_session_id: e.related_session_id,
    related_plan_id: e.related_plan_id,
    created_at: e.created_at,
    narration: narrateEvent({ type: e.type, payload: e.payload as Record<string, unknown> | null, created_at: e.created_at }),
    raw_payload: e.payload,
  }))

  // Devolvemos en orden ascendente por id (reverse) para que el cliente
  // pueda hacer prepend al array sin ordenar.
  items.reverse()

  const max_id = events && events.length > 0
    ? Math.max(...(events as Array<{ id: number }>).map(e => e.id))
    : sinceParam ? parseInt(sinceParam, 10) : 0

  return NextResponse.json({
    items,
    max_id,
    server_time: new Date().toISOString(),
  })
}
