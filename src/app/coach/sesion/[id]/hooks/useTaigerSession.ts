'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { fetchTaigerSession, type ChatMessage, type TaigerSession } from '@/lib/data/taiger'

interface UseTaigerSessionResult {
  session: TaigerSession | null
  notFound: boolean
  loadingSession: boolean
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

/**
 * Carga la sesión del coach: auth → caso 'nueva' (placeholder cliente) →
 * fetch de la sesión persistida vía capa de datos. Maneja notFound y loading.
 *
 * Comportamiento idéntico al useEffect original de page.tsx (líneas 102-147):
 * - sin user → redirect a login.
 * - 'nueva' → sesión placeholder en memoria (la real se crea en el primer POST).
 * - sesión inexistente / ajena → notFound.
 */
export function useTaigerSession(sessionId: string): UseTaigerSessionResult {
  const router = useRouter()
  const [session, setSession] = useState<TaigerSession | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    const loadSession = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?redirect=/coach'); return }

      // 'nueva' es un placeholder cliente: la sesion primaria real se crea en el
      // primer POST a /api/taiger/chat via getOrCreateActiveSession (migration 017).
      if (sessionId === 'nueva') {
        setSession({
          id: 'nueva',
          user_id: user.id,
          session_type: 'continuous',
          messages: [],
          created_at: new Date().toISOString(),
        })
        setMessages([])
        setLoadingSession(false)
        return
      }

      const sessionData = await fetchTaigerSession(supabase, sessionId, user.id)

      if (!sessionData) {
        setNotFound(true)
        setLoadingSession(false)
        return
      }

      setSession(sessionData)
      setMessages(sessionData.messages || [])
      setLoadingSession(false)
    }

    loadSession()
  }, [sessionId, router])

  return { session, notFound, loadingSession, messages, setMessages }
}
