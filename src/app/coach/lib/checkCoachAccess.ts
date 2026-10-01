import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { canAccessServer } from '@/golf/billing/server'

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
 * ¿Puede USAR el coach (endpoints que gastan IA)? Plan que lo incluye + beta
 * habilitada: el mismo doble gate que /coach (page.tsx) aplica por pantallas.
 */
export async function canUseCoach(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!(await canAccessServer('coach-plan', supabase, userId))) return false
  return hasCoachAccess(supabase, userId)
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
