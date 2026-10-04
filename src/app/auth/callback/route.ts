import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sanitizeNext } from '@/lib/auth/login-url'
import { captureError } from '@/lib/error-tracking'

/**
 * Callback de auth: canjea el código (PKCE) o el token (OTP) por la sesión y
 * redirige. NO asigna datos de rondas a la cuenta: el reclamo de tarjetas de
 * invitado por coincidencia de NOMBRE se eliminó (02-oct-2026) porque quien
 * creara cuenta con el mismo nombre se quedaba con la tarjeta de otra persona.
 * Las tarjetas de invitado quedan sin dueño hasta el link tokenizado por
 * jugador (plan 2026-10-02, ítem 9). Test: `__tests__/route.test.ts`.
 */

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
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
    void captureError(error, { context: 'auth.callback.otp', level: 'warning' })
  }

  return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`)
}
