import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sanitizeNext } from '@/lib/auth-helpers'

/**
 * Migrar rondas de invitado a cuenta nueva.
 * Cuando un invitado (is_guest=true, user_id=null) crea cuenta,
 * buscar sus filas en ronda_libre_jugadores por nombre y asignarle el user_id.
 * Así el historial de rondas jugadas como invitado aparece en "Mis rondas".
 */
async function migrateGuestRounds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
    // Obtener nombre del perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()

    if (!profile?.full_name) return

    const nombre = profile.full_name.trim().toLowerCase()
    if (!nombre) return

    // Buscar filas de invitado que coincidan por nombre (sin user_id asignado)
    const { data: guestRows } = await supabase
      .from('ronda_libre_jugadores')
      .select('id, ronda_id, nombre, nombre_invitado, scores')
      .eq('is_guest', true)
      .is('user_id', null)

    if (!guestRows || guestRows.length === 0) return

    // Match por nombre_invitado o nombre (case insensitive)
    const matches = guestRows.filter(row => {
      const invName = (row.nombre_invitado || row.nombre || '').trim().toLowerCase()
      return invName === nombre
    })

    if (matches.length === 0) return

    // Asignar user_id a las filas matcheadas
    const ids = matches.map(m => m.id)
    await supabase
      .from('ronda_libre_jugadores')
      .update({ user_id: userId })
      .in('id', ids)
  } catch {
    // Non-blocking: si falla la migración, el login sigue funcionando
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  // Read 'next' from URL param; localStorage fallback is handled client-side
  // after redirect lands on the destination page
  const next       = sanitizeNext(searchParams.get('next') || searchParams.get('redirect'))
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv    = process.env.NODE_ENV === 'development'

  const baseUrl = isLocalEnv
    ? origin
    : forwardedHost
    ? `https://${forwardedHost}`
    : origin

  const supabase = await createClient()

  // Flujo PKCE (Google OAuth, email confirmation, etc.)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) migrateGuestRounds(supabase, user.id) // fire-and-forget
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
    console.error('PKCE error:', error.message)
  }

  // Flujo Magic Link / OTP
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'recovery' | 'invite' | 'email_change',
    })
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) migrateGuestRounds(supabase, user.id) // fire-and-forget
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
    console.error('OTP error:', error.message)
  }

  return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`)
}
