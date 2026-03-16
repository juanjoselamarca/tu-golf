import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const next       = searchParams.get('next') ?? '/dashboard'
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
    if (!error) return NextResponse.redirect(`${baseUrl}${next}`)
    console.error('PKCE error:', error.message)
  }

  // Flujo Magic Link / OTP
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'recovery' | 'invite' | 'email_change',
    })
    if (!error) return NextResponse.redirect(`${baseUrl}${next}`)
    console.error('OTP error:', error.message)
  }

  return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`)
}
