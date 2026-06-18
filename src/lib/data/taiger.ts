import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TaigerSession {
  id: string
  user_id: string
  session_type: string
  messages: ChatMessage[]
  created_at: string
  updated_at?: string
  rating?: number | null
}

/**
 * Capa de datos del coach tAIger+. Saca el `supabase.from('taiger_sessions')`
 * directo de la page (criterio "sucio" #2). La page/hook NO debe tocar supabase
 * directamente.
 *
 * Retorna la sesión del usuario o null si no existe / no le pertenece (RLS +
 * filtro explícito por user_id). El caller distingue "no encontrada" por null.
 */
export async function fetchTaigerSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<TaigerSession | null> {
  const { data, error } = await supabase
    .from('taiger_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return data as TaigerSession
}
