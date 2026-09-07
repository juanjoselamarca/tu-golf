/**
 * POST /api/coach/post-round-trigger
 *
 * Non-blocking trigger fired by useFinalizeRonda after round completion.
 * Inserts a coach_event signaling "round_completed" so the coach can
 * pick it up on next session open and provide post-round analysis.
 *
 * Body: { roundId: string; userId: string }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: 10 per minute
    const rl = checkRateLimit(`coach-trigger:${user.id}`, 10, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const body = (await request.json().catch(() => null)) as
      | { roundId?: string; userId?: string }
      | null

    if (!body?.roundId || !body?.userId) {
      return NextResponse.json({ error: 'Missing roundId or userId' }, { status: 400 })
    }

    // Create a coach event that signals "round completed, analyze it"
    await supabase.from('coach_events').insert({
      user_id: body.userId,
      event_type: 'round_completed',
      payload: { round_id: body.roundId },
    })

    // TODO: In the future, trigger push notification here
    // For now, the coach will pick this up on next session open

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
