// src/app/api/torneos/[slug]/cupo/route.ts
//
// PATCH — el ORGANIZADOR amplía (o ajusta) el cupo máximo del torneo
// (`tournaments.max_players`). Política "bloquear + ampliar": el alta se bloquea
// al llegar al cupo; para agregar más, el organizador sube el cupo acá.
// No se puede bajar por debajo de los ya inscritos (validado en `updateMaxPlayers`).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { updateMaxPlayers } from '@/lib/data/tournaments/cupo'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  // null = quitar el tope (sin cupo).
  maxPlayers: z.number().int().min(1).nullable(),
})

function httpStatusFor(reason: string): number {
  switch (reason) {
    case 'below_current':
      return 409
    case 'invalid_value':
      return 400
    case 'not_found':
      return 404
    default:
      return 500
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  const { data: t, error: errT } = await admin
    .from('tournaments')
    .select('id, organizer_id')
    .eq('slug', params.slug)
    .single()
  if (errT || !t) {
    return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 })
  }
  if ((t as { organizer_id: string }).organizer_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const result = await updateMaxPlayers(admin, (t as { id: string }).id, parsed.data.maxPlayers)
  if (!result.ok) {
    if (result.reason === 'unknown') {
      void captureError(new Error(result.message), {
        context: 'api.organizador.cupo.update',
        meta: { slug: params.slug },
      })
    }
    return NextResponse.json(
      { error: result.reason, message: result.message, approved: result.approved },
      { status: httpStatusFor(result.reason) }
    )
  }

  return NextResponse.json({ ok: true, maxPlayers: result.maxPlayers, approved: result.approved })
}
