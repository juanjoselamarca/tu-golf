import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Try getUser() first (validates token server-side + refreshes)
  // If it fails, fallback to getSession() (reads cookies only — faster, more reliable)
  let user = null
  const { data: { user: validatedUser } } = await supabase.auth.getUser()
  if (validatedUser) {
    user = validatedUser
  } else {
    // Fallback: session may exist but token refresh failed on edge
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      user = session.user
    }
  }

  // Helper: redirect while preserving refreshed session cookies (including options)
  const redirectWithCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(cookie => {
      response.cookies.set(cookie.name, cookie.value, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
      })
    })
    return response
  }

  // Redirect logged-in users away from auth pages only (NOT from /)
  // Landing page (/) is accessible to everyone — logged in or not
  const pathname = request.nextUrl.pathname
  if (user && (pathname === '/login' || pathname === '/register')) {
    return redirectWithCookies(new URL('/dashboard', request.url))
  }

  const protectedRoutes = ['/dashboard', '/perfil', '/coach', '/organizador', '/admin', '/importar', '/ronda-libre/nueva']
  const isProtected = protectedRoutes.some((r) =>
    pathname.startsWith(r)
  )

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return redirectWithCookies(loginUrl)
  }

  // Admin authorization
  if (user && pathname.startsWith('/admin')) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    // Log minimal info — avoid exposing profile/userId in production logs
    if (profileError) console.warn('[ADMIN CHECK] denied:', profileError.message)
    if (profileError || profile?.role !== 'admin') {
      return redirectWithCookies(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
