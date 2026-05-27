// src/app/api/torneos/[slug]/players/[playerId]/route.ts
//
// PATCH: el admin asigna (o limpia) el tee_id de un jugador inscrito en un torneo.
// Bug #6 inbox 25-may.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'

const bodySchema = z.object({
  tee_id: z.string().uuid().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string; playerId: string } }
) {
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

  // Si tee_id NO es null, validar que pertenezca a la cancha del torneo
  if (tee_id !== null) {
    const { data: t, error: errT } = await supabase
      .from('tournaments')
      .select('course_id')
      .eq('slug', params.slug)
      .single()
    if (errT || !t) {
      void captureError(errT ?? new Error('tournament_not_found'), {
        context: 'api.players.patch_tee.tournament_lookup',
        meta: { slug: params.slug, playerId: params.playerId },
      })
      return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 })
    }

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
