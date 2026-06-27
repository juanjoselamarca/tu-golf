'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage, TaigerSession } from '@/lib/data/taiger'
import { createSseDecoder, type SseEvent } from './sseParser'

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
  /** Follow-up chips (D1) del ÚLTIMO intercambio. Vacío mientras se streamea o si
   *  el endpoint aislado no propuso nada. Tocar uno lo envía como nuevo mensaje. */
  followups: string[]
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
  const [followups, setFollowups] = useState<string[]>([])
  const currentAssistantIdxRef = useRef<number>(-1)
  // Token de turno para los follow-ups: invalida peticiones en vuelo de turnos
  // viejos. Sin esto, si la petición del turno N resuelve DESPUÉS de la del N+1
  // (latencias similares de Haiku), los chips de N quedarían bajo la respuesta de
  // N+1 (contenido equivocado anclado a un mensaje). Mismo patrón que el idx ref.
  const followupTurnRef = useRef(0)

  // Follow-up chips (D1 / E1): tras CERRAR el stream, pide preguntas de seguimiento
  // a un endpoint AISLADO con Haiku. Fire-and-forget — nunca bloquea el chat ni el
  // spinner; si falla o viene vacío, no se muestran chips (ausencia elegante).
  const loadFollowups = useCallback(async (question: string, answer: string) => {
    if (!question.trim() || !answer.trim()) return
    const turn = ++followupTurnRef.current // este turno reclama el slot de followups
    try {
      const res = await fetch('/api/taiger/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.slice(0, 2000), answer: answer.slice(0, 8000) }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (turn !== followupTurnRef.current) return // llegó tarde: ya hay otro turno → descartar
      if (Array.isArray(data?.followups)) {
        setFollowups(data.followups.filter((x: unknown): x is string => typeof x === 'string'))
      }
    } catch {
      /* silencioso: sin chips, el chat sigue intacto */
    }
  }, [])

  const sendFollowUp = useCallback(async (allMessages: ChatMessage[]) => {
    if (!session) return
    setStreaming(true)
    setError(null)

    // ¿llegó algún token antes de un eventual corte? Distingue "no me pude
    // conectar" de "la respuesta se cortó a la mitad" (D6 — degradación honesta).
    let receivedAny = false

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
      // Decoder de bytes SSE compartido con decodeSseStream (test) — fix P0
      // 11-may encapsulado en un solo lugar. Ver sseParser.createSseDecoder.
      const sse = createSseDecoder()
      let assistantContent = ''
      let realSessionId: string | null = null

      setMessages(prev => {
        const next = [...prev, { role: 'assistant' as const, content: '' }]
        currentAssistantIdxRef.current = next.length - 1
        return next
      })

      // Reacciona a un evento SSE ya parseado. El decoder es dueño del buffer
      // de bytes; acá solo aplicamos side-effects de React. Mantiene el orden y
      // la semántica multi-evento del handleSseLine original.
      const applyEvent = (ev: SseEvent) => {
        if (ev.kind === 'text') {
          if (assistantContent === '') setActivity(null)
          receivedAny = true
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const ev of sse.push(value)) applyEvent(ev)
      }
      for (const ev of sse.flush()) applyEvent(ev)

      // Follow-up chips (D1): el stream cerró bien y hay respuesta → pedir sugerencias
      // al endpoint aislado. Fire-and-forget (no se await: las chips aparecen un
      // instante después, sin demorar el cierre del turno — patrón Perplexity).
      if (assistantContent.trim()) {
        const lastUser = [...allMessages].reverse().find(m => m.role === 'user')?.content ?? ''
        void loadFollowups(lastUser, assistantContent)
      }

      // El backend (helper getOrCreateActiveSession) ya hizo el update sobre la sesion
      // primaria. Si veniamos como 'nueva', redirigimos al UUID real para que la URL
      // refleje la sesion persistente.
      if (sessionId === 'nueva' && realSessionId) {
        router.replace(`/coach/sesion/${realSessionId}`)
      }
    } catch {
      // D6 — degradación honesta. La pregunta del usuario YA está en `messages`
      // (no se pierde). Distinguimos corte a mitad de stream de fallo de conexión
      // para no mentir ("se cortó" implica que algo empezó a llegar).
      setError(receivedAny
        ? 'La respuesta se cortó. Toca reintentar.'
        : 'No me pude conectar. Toca reintentar.')
    } finally {
      // Pase lo que pase, nunca dejamos el spinner colgado (CERO FALLOS en cancha).
      setStreaming(false)
    }
  }, [session, sessionId, router, setMessages, loadFollowups])

  const handleSend = useCallback((input: string) => {
    if (!input.trim() || streaming) return

    // Al empezar un turno nuevo: limpiar chips e invalidar cualquier petición de
    // followups en vuelo del turno anterior (aunque todavía no haya un loadFollowups nuevo).
    setFollowups([])
    followupTurnRef.current++
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
    setFollowups([])
    followupTurnRef.current++
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
    followups,
    handleSend,
    handleRetry,
  }
}
