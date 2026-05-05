import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveSessionResult {
  id: string
  created: boolean
}

/**
 * Devuelve la sesion primaria continua del usuario. Si no existe, la crea.
 * Garantiza que cada usuario tenga exactamente una sesion primaria
 * (enforced por el indice unico parcial taiger_sessions_user_primary_unique
 * de la migracion 017).
 */
export async function getOrCreateActiveSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveSessionResult> {
  const { data: existing } = await supabase
    .from('taiger_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle()

  if (existing) {
    return { id: existing.id, created: false }
  }

  const { data: created, error } = await supabase
    .from('taiger_sessions')
    .insert({
      user_id: userId,
      session_type: 'continuous',
      is_primary: true,
      messages: [],
      techniques_assigned: [],
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`No se pudo crear sesion primaria: ${error?.message ?? 'sin data'}`)
  }

  return { id: created.id, created: true }
}
