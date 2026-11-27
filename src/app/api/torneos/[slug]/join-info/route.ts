import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
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
    let info: Awaited<ReturnType<typeof fetchJoinInfo>>
    try {
      info = await fetchJoinInfo(admin, params.slug, user.id)
    } catch (e) {
      // La base no respondió: 500 reintentable (la pantalla ofrece «Reintentar»), nunca «sin perfil» ni «no inscrito».
      void captureError(e, { context: 'join-info', level: 'error' })
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
    }
    if (!info) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ...info, authenticated: true })
  }

  // Unauthenticated → public tournament info (no redirect, no 401) + cupo y gate de invitados,
  // para que la pantalla no ofrezca un formulario que el backend va a rechazar.
  const tournament = await fetchJoinInfoPublica(admin, params.slug)
  if (!tournament) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  let condiciones: Awaited<ReturnType<typeof condicionesInscripcionPublica>>
  try {
    condiciones = await condicionesInscripcionPublica(admin, tournament)
  } catch (e) {
    // El cupo no se pudo leer: 500 reintentable, igual que la rama con sesión (nunca «cupo libre» inventado).
    void captureError(e, { context: 'join-info.publica', level: 'error' })
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  const { capacity, invitados } = condiciones

  return NextResponse.json({
    tournament,
    profile: null,
    alreadyRegistered: false,
    authenticated: false,
    capacity,
    invitados,
  })
}
