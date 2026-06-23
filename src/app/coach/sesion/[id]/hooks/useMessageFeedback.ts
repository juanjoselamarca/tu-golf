'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchMessageFeedback, type ChatMessage, type MessageVote } from '@/lib/data/taiger'

/**
 * Resuelve el próximo estado del voto al tocar un pulgar. Función PURA (testeable):
 * tocar el voto ya activo lo retira (toggle off → 0); tocar el otro lo cambia.
 */
export function nextVote(current: MessageVote | undefined, clicked: MessageVote): MessageVote | 0 {
  return current === clicked ? 0 : clicked
}

/**
 * Clave ESTABLE de un mensaje del coach: hash del contenido (cyrb53 → base36).
 * Identidad resistente al reslicing del backend: la posición del mensaje cambia
 * entre la vista en vivo y la recarga (slice -20 + shift del opener), pero el
 * contenido se persiste verbatim. Hash de 53 bits → colisión despreciable dentro
 * de una sesión; una colisión solo haría que dos mensajes idénticos compartan
 * voto (inofensivo). Determinista (sin estado): mismo contenido → misma clave.
 */
export function messageKey(content: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return n.toString(36)
}

interface UseMessageFeedbackResult {
  /** Votos por índice de mensaje del array actual (derivado de las claves estables). */
  votesByMsgIdx: Record<number, MessageVote>
  /** true cuando el chat permite votar (sesión real persistida, no 'nueva'). */
  canVote: boolean
  submitVote: (messageIndex: number, clicked: MessageVote) => void
}

/**
 * Votos 👍/👎 por mensaje del coach (PR2, E2). Carga los votos previos al abrir
 * la sesión (RLS limita a los del usuario) y los persiste vía
 * /api/taiger/message-feedback, anclados al hash del contenido del mensaje
 * (`message_key`) para que sobrevivan a la recarga aunque el backend reordene el
 * array. Optimista: refleja el voto al instante y revierte si el POST falla
 * (nunca se cae — CERO FALLOS).
 *
 * Solo vota sobre sesiones reales: 'nueva' aún no tiene UUID persistido (el real
 * se crea en el primer POST y la page redirige), así que votar ahí no tendría a
 * qué anclarse. La page muestra los pulgares recién con sesión real.
 */
export function useMessageFeedback(
  sessionId: string,
  messages: ChatMessage[],
): UseMessageFeedbackResult {
  // Votos indexados por la clave estable del mensaje (hash de contenido).
  const [votesByKey, setVotesByKey] = useState<Record<string, MessageVote>>({})
  const canVote = sessionId !== 'nueva'

  useEffect(() => {
    if (!canVote) return
    let cancelled = false
    const load = async () => {
      const supabase = createClient()
      const votes = await fetchMessageFeedback(supabase, sessionId)
      if (!cancelled) setVotesByKey(votes)
    }
    load()
    return () => { cancelled = true }
  }, [sessionId, canVote])

  // Proyecta los votos (por clave) a índices del array actual para el render.
  const votesByMsgIdx = useMemo(() => {
    const byIdx: Record<number, MessageVote> = {}
    messages.forEach((m, i) => {
      if (m.role !== 'assistant' || !m.content) return
      const v = votesByKey[messageKey(m.content)]
      if (v) byIdx[i] = v
    })
    return byIdx
  }, [messages, votesByKey])

  const submitVote = useCallback((messageIndex: number, clicked: MessageVote) => {
    if (!canVote) return
    const msg = messages[messageIndex]
    if (!msg || msg.role !== 'assistant' || !msg.content) return

    const key = messageKey(msg.content)
    const prev = votesByKey[key]
    const target = nextVote(prev, clicked)

    // Optimista: aplicar de inmediato.
    setVotesByKey(curr => {
      const updated = { ...curr }
      if (target === 0) delete updated[key]
      else updated[key] = target
      return updated
    })

    fetch('/api/taiger/message-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message_key: key, vote: target }),
    })
      .then(res => {
        if (!res.ok) throw new Error('vote failed')
      })
      .catch(() => {
        // Revertir al estado previo SOLO si nadie cambió el voto mientras tanto
        // (evita pisar un voto más nuevo si dos clicks corrieron en carrera).
        setVotesByKey(curr => {
          const stillOurs = target === 0 ? curr[key] === undefined : curr[key] === target
          if (!stillOurs) return curr
          const reverted = { ...curr }
          if (prev === undefined) delete reverted[key]
          else reverted[key] = prev
          return reverted
        })
      })
  }, [canVote, sessionId, messages, votesByKey])

  return { votesByMsgIdx, canVote, submitVote }
}
