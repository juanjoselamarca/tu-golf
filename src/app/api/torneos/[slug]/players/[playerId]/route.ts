// src/app/api/torneos/[slug]/players/[playerId]/route.ts
//
// PATCH: el admin asigna (o limpia) el tee_id de un jugador inscrito en un torneo.
// Bug #6 inbox 25-may.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  tee_id: z.string().uuid().nullable(),
})

async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          } catch {}
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string; playerId: string } }
) {
  // Auth: user must be logged in
  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { tee_id } = parsed.data
  const supabase = createAdminClient()

  // Auth: verify user is the tournament organizer
  const { data: t, error: errT } = await supabase
    .from('tournaments')
    .select('id, course_id, organizer_id')
    .eq('slug', params.slug)
    .single()
  if (errT || !t) {
    void captureError(errT ?? new Error('tournament_not_found'), {
      context: 'api.players.patch_tee.tournament_lookup',
      meta: { slug: params.slug, playerId: params.playerId },
    })
    return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 })
  }
  if ((t as { organizer_id: string }).organizer_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Verify player belongs to this tournament
  const { data: player, error: errP } = await supabase
    .from('players')
    .select('id')
    .eq('id', params.playerId)
    .eq('tournament_id', (t as { id: string }).id)
    .single()
  if (errP || !player) {
    return NextResponse.json({ error: 'player_not_in_tournament' }, { status: 404 })
  }

  // Si tee_id NO es null, validar que pertenezca a la cancha del torneo
  if (tee_id !== null) {
    const { data: ct, error: errCt } = await supabase
      .from('course_tees')
      .select('course_id')
      .eq('id', tee_id)
      .single()
    if (errCt || !ct) {
      return NextResponse.json({ error: 'tee_not_found' }, { status: 404 })
    }
    if ((ct as { course_id: string }).course_id !== (t as { course_id: string }).course_id) {
      return NextResponse.json({ error: 'tee_belongs_to_other_course' }, { status: 409 })
    }
  }

  const { error: errU } = await supabase
    .from('players')
    .update({ tee_id })
    .eq('id', params.playerId)
    .eq('tournament_id', (t as { id: string }).id)

  if (errU) {
    void captureError(errU, {
      context: 'api.players.patch_tee.update',
      meta: { playerId: params.playerId, tee_id },
    })
    return NextResponse.json(
      { error: 'update_failed', detail: errU.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
