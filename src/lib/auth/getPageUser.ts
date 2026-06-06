import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Usuario autenticado para un Server Component, SIN round-trip de validación.
 *
 * Lee la sesión de la cookie con `getSession()` (local, decodifica el JWT) en
 * vez de `getUser()` (que valida el token contra el servidor de Supabase en
 * cada llamada). El `middleware.ts` ya ejecuta `getUser()` en CADA request no
 * estático (el matcher captura todo salvo assets) y refresca el token, así que
 * la cookie que lee la página ya pasó por validación en el mismo request. Esto
 * evita duplicar un round-trip a la BD (otra región: ~120ms por carga).
 *
 * SEGURIDAD — usar SOLO en Server Components de rutas que el middleware
 * REDIRIGE a /login si no hay user (las de `protectedRoutes` en middleware.ts:
 * /dashboard, /perfil, /coach, /organizador, /admin, /importar,
 * /ronda-libre/nueva). En esas rutas, un token forjado/expirado → getUser() del
 * middleware da null → redirect → la página nunca renderiza, así que getSession()
 * acá nunca ve un JWT no validado.
 *
 * NO usar en rutas PÚBLICAS (ej. /torneo/[slug], /tarjeta/[id]): ahí el
 * middleware corre getUser() pero NO redirige ni limpia la cookie inválida, así
 * que getSession() podría devolver un viewer forjado. En rutas públicas usar
 * `supabase.auth.getUser()` directo (esa es la frontera de confianza). Tampoco
 * usar en route handlers sin gate propio.
 */
export async function getPageUser(supabase: SupabaseClient): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
