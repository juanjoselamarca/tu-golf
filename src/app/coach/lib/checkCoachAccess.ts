import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'

/**
 * Verifica acceso al coach. Redirige a /coach (pantalla gate) si no tiene.
 * Usar en sub-rutas del coach (sesión, progreso) como primer paso.
 */
export async function checkCoachAccess(): Promise<void> {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect('/login?next=/coach')

  const { data: accessRow } = await supabase
    .from('profiles')
    .select('coach_access_enabled')
    .eq('id', user.id)
    .maybeSingle()

  if (accessRow?.coach_access_enabled !== true) {
    redirect('/coach')
  }
}
