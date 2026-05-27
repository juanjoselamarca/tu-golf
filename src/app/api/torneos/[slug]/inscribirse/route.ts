import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import {
  calcCourseHandicap,
  fetchJoinInfo,
  registerPlayerAndRound,
} from '@/lib/data/tournaments/joinFlow'

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
    return NextResponse.json({ error: 'already_registered', message: 'Ya estás inscrito en este torneo.' }, { status: 409 })

  const course = info.tournament.courses
  const courseHandicap =
    info.profile?.indice != null && course
      ? calcCourseHandicap(info.profile.indice, course.slope_rating, course.course_rating, course.par_total)
      : null

  const result = await registerPlayerAndRound(admin, {
    tournamentId: info.tournament.id,
    userId: user.id,
    courseHandicap,
  })

  if (!result.ok) {
    const status = result.reason === 'duplicate' ? 409 : result.reason === 'permission' ? 403 : 400
    return NextResponse.json({ error: result.reason, message: result.message }, { status })
  }

  return NextResponse.json({ ok: true, playerId: result.playerId })
}
