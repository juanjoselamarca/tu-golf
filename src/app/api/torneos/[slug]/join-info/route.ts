import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { fetchJoinInfo, fetchJoinInfoPublica } from '@/lib/data/tournaments/joinFlow'
import { invitadosCerradosPorPlan } from '@/lib/data/tournaments/invitados-por-plan'

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

  // Unauthenticated → public tournament info only (no redirect, no 401)
  const tournament = await fetchJoinInfoPublica(admin, params.slug)
  if (!tournament) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    tournament,
    profile: null,
    alreadyRegistered: false,
    authenticated: false,
    // El visitante sin sesión se inscribe como invitado: si el plan del organizador no lo
    // permite, la UI lo dice antes de que llene el formulario (antes: 403 al enviarlo).
    invitadosCerrados: await invitadosCerradosPorPlan(admin, tournament.organizer_id),
  })
}
