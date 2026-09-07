import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'

/**
 * Predicado canónico: ¿tiene este usuario acceso al coach?
 * Fuente única para la regla "un concepto, una fuente".
 * Usado por page.tsx (renderiza gate) y sub-rutas (redirect).
 */
export async function hasCoachAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('coach_access_enabled')
    .eq('id', userId)
    .maybeSingle()
  return data?.coach_access_enabled === true
}

/**
 * Guard para sub-rutas del coach. Redirige a /coach (pantalla gate) si no tiene acceso.
 */
export async function checkCoachAccess(): Promise<void> {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/coach')

  if (!(await hasCoachAccess(supabase, user.id))) {
    redirect('/coach')
  }
}
