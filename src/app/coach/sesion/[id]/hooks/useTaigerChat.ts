'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage, TaigerSession } from '@/lib/data/taiger'
import { parseSseLine } from './sseParser'

interface UseTaigerChatArgs {
  session: TaigerSession | null
  sessionId: string
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  opener: string | null
  setOpener: React.Dispatch<React.SetStateAction<string | null>>
}

interface UseTaigerChatResult {
  streaming: boolean
  error: string | null
  activity: string | null
  plansByMsgIdx: Record<number, AssignedPlan>
  roundsByMsgIdx: Record<number, RoundSummary>
  projectionsByMsgIdx: Record<number, ScoreProjection>
  handleSend: (input: string) => void
  handleRetry: () => void
}

/**
 * Streaming SSE del coach tAIger+. EXTRAÍDO de page.tsx preservando EXACTAMENTE
 * el protocolo con fix P0 del 11-may:
 *   - buffer de bytes entre `reader.read()`,
 *   - `decoder.decode(value, { stream: true })` (acumula multi-byte UTF-8),
 *   - split por `\n\n` (frames SSE), dejando el parcial en el buffer,
 *   - flush final con `decoder.decode()`.
 * La interpretación de cada línea va a `parseSseLine` (módulo puro testeable).
 */
export function useTaigerChat({
  session,
  sessionId,
  messages,
  setMessages,
  opener,
  setOpener,
}: UseTaigerChatArgs): UseTaigerChatResult {
  const router = useRouter()
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<string | null>(null)
  // Plans/rounds/projections indexados por el índice del mensaje assistant que
  // los originó. Cuando el LLM dispara save_plan durante un stream, queda
  // anclado al placeholder del assistant correspondiente.
  const [plansByMsgIdx, setPlansByMsgIdx] = useState<Record<number, AssignedPlan>>({})
  const [roundsByMsgIdx, setRoundsByMsgIdx] = useState<Record<number, RoundSummary>>({})
  const [projectionsByMsgIdx, setProjectionsByMsgIdx] = useState<Record<number, ScoreProjection>>({})
  const currentAssistantIdxRef = useRef<number>(-1)

  const sendFollowUp = useCallback(async (allMessages: ChatMessage[]) => {
    if (!session) return
    setStreaming(true)
    setError(null)

    try {
      // El backend siempre append a la sesion primaria del usuario (migration 017).
      // session_id es opcional ahora — solo informa al backend cual sesion esta abierta en UI.
      // Sanitizamos el payload contra los límites del schema del backend:
      //   - máximo 50 mensajes en el array (cap actual). Tomamos los últimos 30
      //     para tener margen y que el backend pueda hacer su propio slice(-20).
      //   - máximo 2000 chars por mensaje (truncamos defensivamente: respuestas
      //     viejas largas del coach podrían exceder y romper el chat entero).
      //   - filtramos vacíos para no mandar placeholder de assistant en blanco.
      const safeMessages = allMessages
        .filter(m => typeof m.content === 'string' && m.content.trim().length > 0)
        .slice(-30)
        .map(m => ({
          role: m.role,
          content: m.content.length > 2000 ? m.content.slice(0, 2000) : m.content,
        }))

      const res = await fetch('/api/taiger/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: safeMessages,
          ...(sessionId !== 'nueva' ? { session_id: sessionId } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        const friendly = data.error === 'Input inválido' && data.details
          ? `Tu mensaje no pudo enviarse: ${data.details}. Intenta uno más corto.`
          : data.error || 'Error al conectar con tAIger+'
        setError(friendly)
        setStreaming(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let realSessionId: string | null = null

      setMessages(prev => {
        const next = [...prev, { role: 'assistant' as const, content: '' }]
        currentAssistantIdxRef.current = next.length - 1
        return next
      })

      // Aplica los eventos decodificados de una línea SSE. El loop de bytes
      // (más abajo) es dueño del buffer; acá solo reaccionamos a eventos ya
      // parseados por `parseSseLine` (módulo puro). Mantiene el orden y la
      // semántica multi-evento del handleSseLine original.
      const applyLine = (line: string) => {
        for (const ev of parseSseLine(line)) {
          if (ev.kind === 'text') {
            if (assistantContent === '') setActivity(null)
            assistantContent += ev.text
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: assistantContent,
              }
              return updated
            })
          } else if (ev.kind === 'tool_start') {
            setActivity(ev.label)
          } else if (ev.kind === 'tool_done') {
            setActivity(null)
            if (ev.round) {
              const idx = currentAssistantIdxRef.current
              if (idx >= 0) {
                setRoundsByMsgIdx(prev => ({ ...prev, [idx]: ev.round as RoundSummary }))
              }
            }
          } else if (ev.kind === 'plan_assigned') {
            const idx = currentAssistantIdxRef.current
            if (idx >= 0) {
              setPlansByMsgIdx(prev => ({ ...prev, [idx]: ev.plan }))
            }
          } else if (ev.kind === 'score_projection') {
            const idx = currentAssistantIdxRef.current
            if (idx >= 0) {
              setProjectionsByMsgIdx(prev => ({ ...prev, [idx]: ev.projection }))
            }
          } else if (ev.kind === 'done') {
            realSessionId = ev.sessionId
          } else if (ev.kind === 'error') {
            setError(ev.message)
          }
        }
      }

      // Buffer entre `reader.read()` para soportar frames SSE partidos
      // entre chunks TCP. Sin esto:
      //   - `decoder.decode(value)` (sin {stream:true}) corrompe acentos/emojis
      //     cuando un byte multi-byte UTF-8 cae al final del chunk.
      //   - Un frame `data: {...}\n\n` partido a mitad del JSON cae al catch
      //     silencioso y el cliente pierde tokens (texto con huecos).
      // Procesamos frames separados por `\n\n` (separador SSE real) y
      // dejamos el último parcial en el buffer hasta el próximo read.
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // {stream:true} acumula bytes multi-byte UTF-8 incompletos para el
        // próximo decode. Sin esto, los acentos del coach se rompen al azar.
        buffer += decoder.decode(value, { stream: true })

        // Procesamos frames completos; el último puede estar parcial y queda
        // en el buffer para el próximo iteración.
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          for (const line of frame.split('\n')) applyLine(line)
        }
      }
      // Flush final: aplica el resto del buffer + cualquier byte multi-byte
      // pendiente del último read.
      buffer += decoder.decode()
      for (const frame of buffer.split('\n\n')) {
        for (const line of frame.split('\n')) applyLine(line)
      }

      // El backend (helper getOrCreateActiveSession) ya hizo el update sobre la sesion
      // primaria. Si veniamos como 'nueva', redirigimos al UUID real para que la URL
      // refleje la sesion persistente.
      if (sessionId === 'nueva' && realSessionId) {
        router.replace(`/coach/sesion/${realSessionId}`)
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setStreaming(false)
    }
  }, [session, sessionId, router, setMessages])

  const handleSend = useCallback((input: string) => {
    if (!input.trim() || streaming) return

    const userMessage: ChatMessage = { role: 'user', content: input.trim() }
    // Si hay opener y es el primer turno, materializarlo como mensaje del coach
    // antes del mensaje del usuario. Asi el LLM ve el contexto completo y la
    // sesion persiste el flow natural.
    const baseMessages: ChatMessage[] = (messages.length === 0 && opener)
      ? [{ role: 'assistant', content: opener }]
      : messages
    const newMessages = [...baseMessages, userMessage]
    setMessages(newMessages)
    setOpener(null)
    sendFollowUp(newMessages)
  }, [streaming, messages, opener, setMessages, setOpener, sendFollowUp])

  // Reintentar tras error de conexión: descarta el placeholder assistant
  // que quedó vacío/parcial y rellama sendFollowUp con el último user turn.
  const handleRetry = useCallback(() => {
    if (streaming) return
    const last = messages[messages.length - 1]
    const cleaned = last?.role === 'assistant'
      ? messages.slice(0, -1)
      : messages
    setMessages(cleaned)
    sendFollowUp(cleaned)
  }, [streaming, messages, setMessages, sendFollowUp])

  return {
    streaming,
    error,
    activity,
    plansByMsgIdx,
    roundsByMsgIdx,
    projectionsByMsgIdx,
    handleSend,
    handleRetry,
  }
}
