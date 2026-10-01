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
 * ¿Puede USAR el coach? FUENTE ÚNICA para las tres capas: /coach (page.tsx), sus
 * sub-rutas (checkCoachAccess) y los endpoints que gastan IA.
 *
 * Decisión (CTO por delegación de Juanjo, 01-oct-2026, marcha blanca): la BETA
 * habilitada (código TAIGER25 → coach_access_enabled) da acceso al coach, con o
 * sin plan. Antes había dos reglas: /coach exigía plan + beta y las sub-rutas sólo
 * beta, así que el único usuario real (beta, plan free) veía el upsell en /coach
 * pero podía chatear desde Mi Golf. Si al lanzar se exige plan, el cambio va acá.
 */
export async function canUseCoach(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return hasCoachAccess(supabase, userId)
}

/**
 * Guard para sub-rutas del coach. Redirige a /coach (pantalla gate) si no tiene acceso.
 */
export async function checkCoachAccess(): Promise<void> {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/coach')

  if (!(await canUseCoach(supabase, user.id))) {
    redirect('/coach')
  }
}
