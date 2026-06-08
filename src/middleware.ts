import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Request ID para trazabilidad (aparece en logs y headers de respuesta)
  const requestId = crypto.randomUUID()
  let supabaseResponse = NextResponse.next({ request })
  supabaseResponse.headers.set('x-request-id', requestId)

  const pathname = request.nextUrl.pathname

  // Solo estas rutas de PÁGINA necesitan leer la sesión en el middleware:
  //  - protectedRoutes: redirigen a /login si no hay user válido.
  //  - /login y /register: redirigen a /dashboard si el user YA está logueado.
  // El resto de páginas públicas (landing /, /torneo, /tarjeta, /unirse, etc.)
  // retorna sin tocar Supabase, evitando un round-trip getUser() cross-continente
  // (Vercel gru1 ↔ Supabase sa-east-1, ~120ms) en cada request → mata el TTFB de
  // la primera pantalla. Las páginas públicas que leen auth (torneo, tarjeta)
  // llaman getUser() ellas mismas — son su propia frontera de confianza — y el
  // token también se refresca client-side, así que saltearlo acá no caduca la
  // sesión. getPageUser() solo se usa en rutas protegidas, donde getUser() abajo
  // sigue corriendo (frontera de confianza intacta).
  //
  // /api/* SÍ pasa por getUser(): el middleware refresca el JWT en cada llamada,
  // y excluirlo rompería sesiones largas que pollean una API (ej. /en-vivo en un
  // torneo) → logout prematuro. Decisión deliberada (memoria 4938, 28-abr-2026);
  // el costo en /api es marginal (la mayoría de /en-vivo sale del CDN, s-maxage).
  // Si editás esta lista, sincronizá el canario `getPageUser solo en rutas
  // protegidas` en src/__tests__/canary-stability.test.ts y el replica de
  // F7-auth-onboarding.test.ts (ambos duplican estos prefijos a propósito).
  const protectedRoutes = ['/dashboard', '/perfil', '/coach', '/organizador', '/admin', '/importar', '/ronda-libre/nueva']
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r))
  const isAuthPage = pathname === '/login' || pathname === '/register'
  const isApi = pathname.startsWith('/api')

  if (!isProtected && !isAuthPage && !isApi) {
    return supabaseResponse
  }

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
    response.headers.set('x-request-id', requestId)
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
  if (user && isAuthPage) {
    return redirectWithCookies(new URL('/dashboard', request.url))
  }

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
