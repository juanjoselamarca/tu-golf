import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { fetchJoinInfo } from '@/lib/data/tournaments/joinFlow'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()

  // Authenticated → full info (profile + alreadyRegistered)
  if (user) {
    const info = await fetchJoinInfo(admin, params.slug, user.id)
    if (!info) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ...info, authenticated: true })
  }

  // Unauthenticated → public tournament info only (no redirect, no 401)
  const { data: tournament } = await admin
    .from('tournaments')
    .select(
      'id, name, slug, format, status, organizer_id, date_start, codigo, course_name, courses(nombre, ciudad, slope_rating, course_rating, par_total)'
    )
    .eq('slug', params.slug)
    .maybeSingle()

  if (!tournament) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const PUBLIC_STATUSES = ['open', 'in_progress', 'closed', 'published']
  if (!PUBLIC_STATUSES.includes((tournament as { status: string }).status)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    tournament: tournament as unknown,
    profile: null,
    alreadyRegistered: false,
    authenticated: false,
  })
}
