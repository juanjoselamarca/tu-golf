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

/** Voto por mensaje: +1 = me sirvió, -1 = no me sirvió. */
export type MessageVote = 1 | -1

/**
 * Lee los votos 👍/👎 ya emitidos por el usuario en una sesión, indexados por la
 * clave estable del mensaje (`message_key` = hash del contenido). RLS limita a
 * las filas del propio usuario, así que no hace falta filtrar por user_id acá.
 * Lectura tolerante a fallos: ante error devuelve `{}` (la UI simplemente no
 * muestra votos previos, nunca se cae — CERO FALLOS).
 */
export async function fetchMessageFeedback(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Record<string, MessageVote>> {
  const { data, error } = await supabase
    .from('taiger_message_feedback')
    .select('message_key, vote')
    .eq('session_id', sessionId)

  if (error || !data) return {}

  const byKey: Record<string, MessageVote> = {}
  for (const row of data as { message_key: string; vote: number }[]) {
    if (row.vote === 1 || row.vote === -1) byKey[row.message_key] = row.vote
  }
  return byKey
}
