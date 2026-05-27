import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { fetchJoinInfo, registerPlayerAndRound } from '@/lib/data/tournaments/joinFlow'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const info = await fetchJoinInfo(admin, params.slug, user.id)
  if (!info) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (info.alreadyRegistered)
    return NextResponse.json(
      { error: 'already_registered', message: 'Ya estás inscrito en este torneo.' },
      { status: 409 }
    )

  const course = info.tournament.courses
  const courseHandicap =
    info.profile?.indice != null
      ? resolverCourseHandicap(
          info.profile.indice,
          course && course.slope_rating != null && course.course_rating != null
            ? {
                slope: course.slope_rating,
                courseRating: course.course_rating,
                par: course.par_total ?? 72,
              }
            : null
        )
      : null

  const result = await registerPlayerAndRound(admin, {
    tournamentId: info.tournament.id,
    tournamentStatus: info.tournament.status,
    userId: user.id,
    courseHandicap,
  })

  if (!result.ok) {
    const status =
      result.reason === 'already_registered'
        ? 409
        : result.reason === 'not_inscribible'
        ? 409
        : result.reason === 'forbidden'
        ? 403
        : 400
    return NextResponse.json({ error: result.reason, message: result.message }, { status })
  }

  return NextResponse.json({ ok: true, playerId: result.playerId })
}
