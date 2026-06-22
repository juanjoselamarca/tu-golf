'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchMessageFeedback, type MessageVote } from '@/lib/data/taiger'

/**
 * Resuelve el próximo estado del voto al tocar un pulgar. Función PURA (testeable):
 * tocar el voto ya activo lo retira (toggle off → 0); tocar el otro lo cambia.
 */
export function nextVote(current: MessageVote | undefined, clicked: MessageVote): MessageVote | 0 {
  return current === clicked ? 0 : clicked
}

interface UseMessageFeedbackResult {
  /** Votos por índice de mensaje del assistant. */
  votesByMsgIdx: Record<number, MessageVote>
  /** true cuando el chat permite votar (sesión real persistida, no 'nueva'). */
  canVote: boolean
  submitVote: (messageIndex: number, clicked: MessageVote) => void
}

/**
 * Votos 👍/👎 por mensaje del coach (PR2, E2). Carga los votos previos al abrir
 * la sesión (RLS limita a los del usuario) y los persiste vía
 * /api/taiger/message-feedback. Optimista: refleja el voto al instante y revierte
 * si el POST falla (nunca se cae — CERO FALLOS).
 *
 * Solo vota sobre sesiones reales: 'nueva' aún no tiene UUID persistido (el real
 * se crea en el primer POST y la page redirige), así que votar ahí no tendría a
 * qué anclarse. La page muestra los pulgares recién con sesión real.
 */
export function useMessageFeedback(sessionId: string): UseMessageFeedbackResult {
  const [votesByMsgIdx, setVotesByMsgIdx] = useState<Record<number, MessageVote>>({})
  const canVote = sessionId !== 'nueva'

  useEffect(() => {
    if (!canVote) return
    let cancelled = false
    const load = async () => {
      const supabase = createClient()
      const votes = await fetchMessageFeedback(supabase, sessionId)
      if (!cancelled) setVotesByMsgIdx(votes)
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, canVote])

  const submitVote = useCallback((messageIndex: number, clicked: MessageVote) => {
    if (!canVote) return

    const prev = votesByMsgIdx[messageIndex]
    const target = nextVote(prev, clicked)

    // Optimista: aplicar de inmediato.
    setVotesByMsgIdx(curr => {
      const updated = { ...curr }
      if (target === 0) delete updated[messageIndex]
      else updated[messageIndex] = target
      return updated
    })

    fetch('/api/taiger/message-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message_index: messageIndex, vote: target }),
    })
      .then(res => {
        if (!res.ok) throw new Error('vote failed')
      })
      .catch(() => {
        // Revertir al estado previo si el server rechazó (sin romper la UI).
        setVotesByMsgIdx(curr => {
          const reverted = { ...curr }
          if (prev === undefined) delete reverted[messageIndex]
          else reverted[messageIndex] = prev
          return reverted
        })
      })
  }, [canVote, sessionId, votesByMsgIdx])

  return { votesByMsgIdx, canVote, submitVote }
}
