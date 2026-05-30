/**
 * Guard de auth para endpoints/pages admin del cerebro v3.
 *
 * Reusa el patrón SSR del resto del app (`@/utils/supabase/server`) que
 * lee las cookies chunked de `@supabase/ssr` (`sb-<ref>-auth-token`).
 * El intento original con `sb-access-token` siempre devolvía false porque
 * esa cookie no existe en este proyecto.
 */
import { createClient } from '@/utils/supabase/server'
import { isAdmin as isAdminById } from '@/lib/admin'

export async function isCerebroAdmin(): Promise<boolean> {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  return isAdminById(user?.id, sb)
}
