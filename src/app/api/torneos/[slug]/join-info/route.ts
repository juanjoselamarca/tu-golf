import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { condicionesInscripcionPublica, fetchJoinInfo, fetchJoinInfoPublica } from '@/lib/data/tournaments/joinFlow'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
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

  // Unauthenticated → public tournament info (no redirect, no 401) + cupo y gate de invitados,
  // para que la pantalla no ofrezca un formulario que el backend va a rechazar.
  const tournament = await fetchJoinInfoPublica(admin, params.slug)
  if (!tournament) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { capacity, invitados } = await condicionesInscripcionPublica(admin, tournament)

  return NextResponse.json({
    tournament,
    profile: null,
    alreadyRegistered: false,
    authenticated: false,
    capacity,
    invitados,
  })
}
