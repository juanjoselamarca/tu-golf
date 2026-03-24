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

  // Refresh session on every request — prevents logout when access token expires
  // getUser() internally refreshes the token via the cookie handler above,
  // which writes the new tokens back to the response cookies
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const protectedRoutes = ['/dashboard', '/perfil', '/coach', '/organizador', '/admin', '/importar']
  const isProtected = protectedRoutes.some((r) =>
    pathname.startsWith(r)
  )

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return redirectWithCookies(loginUrl)
  }

  // Admin authorization — uses service_role to bypass RLS (standard pattern
  // for server-side auth checks, service_role key never reaches the client)
  if (user && pathname.startsWith('/admin')) {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const adminDb = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: profile } = await adminDb
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
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
