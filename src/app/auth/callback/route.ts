import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}/dashboard`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}/dashboard`)
      } else {
        return NextResponse.redirect(`${origin}/dashboard`)
      }
    }

    console.error('exchangeCodeForSession error:', error.message, error.status)
  }

  const errorBase = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin
  return NextResponse.redirect(`${errorBase}/auth/auth-code-error`)
}
