// src/app/api/torneos/[slug]/players/route.ts
//
// POST — el ORGANIZADOR inscribe un jugador (registrado o invitado) al torneo.
// Antes esto lo hacía el cliente con supabase.from() directo (hook usePlayers),
// sin validar el cupo ni el organizador. Ahora pasa por la fuente única
// `enrollPlayer`, que valida el cupo server-side en TODOS los caminos.
//
// Política de cupo ("bloquear + ampliar", PM 2026-07-09): si el torneo está
// lleno, el alta se RECHAZA (409 tournament_full). El organizador amplía el
// cupo con PATCH /api/torneos/[slug]/cupo.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { enrollPlayer } from '@/lib/data/tournaments/enrollPlayer'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'
import { captureError } from '@/lib/error-tracking'

export const dynamic = 'force-dynamic'

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('registered'),
    userId: z.string().uuid(),
    categoryId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    mode: z.literal('guest'),
    guestName: z.string().trim().min(1).max(120),
    handicapIndex: z.number().finite().nullable(),
    categoryId: z.string().uuid().nullable().optional(),
  }),
])

function httpStatusFor(reason: string): number {
  switch (reason) {
    case 'tournament_full':
    case 'already_registered':
    case 'not_inscribible':
      return 409
    case 'forbidden':
      return 403
    default:
      return 400
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
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
  const body = parsed.data

  const admin = createAdminClient()

  // Cargar torneo + cancha y verificar que el usuario es el ORGANIZADOR.
  const { data: t, error: errT } = await admin
    .from('tournaments')
    .select(
      'id, status, organizer_id, courses(slope_rating, course_rating, par_total)'
    )
    .eq('slug', params.slug)
    .single()
  if (errT || !t) {
    return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 })
  }
  const tournament = t as unknown as {
    id: string
    status: string
    organizer_id: string
    courses: { slope_rating: number | null; course_rating: number | null; par_total: number | null } | null
  }
  if (tournament.organizer_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const course = tournament.courses

  let result
  if (body.mode === 'registered') {
    // Índice del jugador desde su perfil (server-side, no confiar en el cliente).
    const { data: profile } = await admin
      .from('profiles')
      .select('indice')
      .eq('id', body.userId)
      .maybeSingle()
    const indice = (profile as { indice: number | null } | null)?.indice ?? null
    const courseHandicap =
      indice != null
        ? resolverCourseHandicap(
            indice,
            course && course.slope_rating != null && course.course_rating != null
              ? {
                  slope: course.slope_rating,
                  courseRating: course.course_rating,
                  par: course.par_total ?? 72,
                }
              : null
          )
        : null
    result = await enrollPlayer(admin, {
      tournamentId: tournament.id,
      tournamentStatus: tournament.status,
      identity: { kind: 'registered', userId: body.userId },
      handicapAtRegistration: courseHandicap,
      categoryId: body.categoryId ?? null,
      // El organizador gestiona el torneo: puede inscribir en 'draft'/'open'.
      enforceStatusGate: false,
    })
  } else {
    // Invitado: se guarda el ÍNDICE crudo tipeado por el organizador (el
    // leaderboard lo convierte a course handicap con el tee del jugador).
    result = await enrollPlayer(admin, {
      tournamentId: tournament.id,
      tournamentStatus: tournament.status,
      identity: { kind: 'guest', guestName: body.guestName },
      handicapAtRegistration: body.handicapIndex,
      categoryId: body.categoryId ?? null,
      enforceStatusGate: false,
    })
  }

  if (!result.ok) {
    if (result.reason === 'unknown') {
      void captureError(new Error(result.message), {
        context: 'api.organizador.players.enroll',
        meta: { slug: params.slug, mode: body.mode },
      })
    }
    return NextResponse.json(
      { error: result.reason, message: result.message },
      { status: httpStatusFor(result.reason) }
    )
  }

  return NextResponse.json({ ok: true, playerId: result.playerId })
}
