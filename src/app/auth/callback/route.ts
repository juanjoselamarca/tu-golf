import { NextResponse, after } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sanitizeNext } from '@/lib/auth-helpers'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'
import { reclamarTarjetasDeInvitado } from '@/lib/data/ronda-libre-guest-claim'

/**
 * Invitado que crea cuenta: sus tarjetas de ronda libre pasan a su historial.
 * `after()` corre después de enviar el redirect sin que la función muera antes.
 */
function reclamarEnSegundoPlano(userId: string) {
  after(() => reclamarTarjetasDeInvitado(createAdminClient(), userId))
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
      if (user) reclamarEnSegundoPlano(user.id)
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
    void captureError(error, { context: 'auth.callback.pkce', level: 'warning' })
  }

  // Flujo Magic Link / OTP
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'recovery' | 'invite' | 'email_change',
    })
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) reclamarEnSegundoPlano(user.id)
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
    void captureError(error, { context: 'auth.callback.otp', level: 'warning' })
  }

  return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`)
}
