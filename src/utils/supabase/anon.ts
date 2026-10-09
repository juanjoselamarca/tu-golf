import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase ANÓNIMO para el servidor, SIN cookies ni sesión.
 *
 * Para rutas públicas cacheables en el CDN (`Cache-Control: public, s-maxage=…`):
 * como no lee la sesión de quien pregunta, la respuesta es idéntica para todos y
 * el CDN la colapsa (M espectadores ≈ 1 consulta a la base por intervalo).
 * Respeta RLS como rol `anon`: sólo ve lo que cualquiera puede ver.
 *
 * Nunca usarlo para algo que dependa del usuario: para eso `@/utils/supabase/server`.
 */
export function createAnonClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
}
