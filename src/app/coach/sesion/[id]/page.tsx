'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createClient } from '@/lib/supabase'
import { Calendar, PersonStanding } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { PlanAssignedCard, type AssignedPlan } from '@/components/coach/PlanAssignedCard'
import { RoundMiniChart, type RoundSummary } from '@/components/coach/RoundMiniChart'
import { CitedMarkdown } from '@/components/coach/CitedMarkdown'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TaigerSession {
  id: string
  user_id: string
  session_type: string
  messages: ChatMessage[]
  created_at: string
  updated_at?: string
  rating?: number | null
}

function shouldRenderChart(text: string): boolean {
  if (!text || text.length < 30) return false
  return /\bhoyos?\b|\bback nine\b|\bfront nine\b|\bh\d+\b|\bida\b|\bvuelta\b|primeros 9|últimos 9|ultimos 9/i.test(text)
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  continuous: 'Conversación continua',
  post_round: 'Analisis post-ronda',
  weekly_plan: 'Plan semanal',
  free: 'Consulta libre',
}

const SESSION_TYPE_ICONS: Record<string, React.ReactNode> = {
  continuous: <TaigerIcon size={14} />,
  post_round: <PersonStanding size={14} />,
  weekly_plan: <Calendar size={14} />,
}

export default function SesionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.id as string

  const [session, setSession] = useState<TaigerSession | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadingSession, setLoadingSession] = useState(true)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState<number>(0)
  const [ratingHover, setRatingHover] = useState<number>(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [opener, setOpener] = useState<string | null>(null)
  const [openerLoading, setOpenerLoading] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  // Plans asignados durante la conversación, indexados por el índice del
  // mensaje assistant que los originó (messages[idx]). Cuando el LLM dispara
  // save_plan durante un stream, el plan queda anclado al placeholder del
  // assistant correspondiente.
  const [plansByMsgIdx, setPlansByMsgIdx] = useState<Record<number, AssignedPlan>>({})
  const [roundsByMsgIdx, setRoundsByMsgIdx] = useState<Record<number, RoundSummary>>({})
  const currentAssistantIdxRef = useRef<number>(-1)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Opener proactivo: cuando la sesion esta vacia, traer un saludo personalizado.
  // No persiste en BD — si el usuario responde, se materializa como primer turno
  // dentro de handleSend (ver materializacion del opener al armar newMessages).
  useEffect(() => {
    if (loadingSession) return
    if (messages.length > 0) return
    if (opener || openerLoading) return
    setOpenerLoading(true)
    fetch('/api/taiger/intro', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.opener) setOpener(d.opener) })
      .catch(() => { /* fallback silencioso: queda el espacio vacio */ })
      .finally(() => setOpenerLoading(false))
  }, [loadingSession, messages.length, opener, openerLoading])

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

      const { data: sessionData, error: sessionError } = await supabase
        .from('taiger_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single()

      if (sessionError || !sessionData) {
        setNotFound(true)
        setLoadingSession(false)
        return
      }

      const typedSession = sessionData as TaigerSession
      setSession(typedSession)
      setMessages(sessionData.messages || [])
      if (typedSession.rating) {
        setRating(typedSession.rating)
        setRatingSubmitted(true)
      }
      setLoadingSession(false)
    }

    loadSession()
  }, [sessionId, router])

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

      // Buffer entre `reader.read()` para soportar frames SSE partidos
      // entre chunks TCP. Sin esto:
      //   - `decoder.decode(value)` (sin {stream:true}) corrompe acentos/emojis
      //     cuando un byte multi-byte UTF-8 cae al final del chunk.
      //   - Un frame `data: {...}\n\n` partido a mitad del JSON cae al catch
      //     silencioso y el cliente pierde tokens (texto con huecos).
      // Procesamos frames separados por `\n\n` (separador SSE real) y
      // dejamos el último parcial en el buffer hasta el próximo read.
      let buffer = ''
      const handleSseLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        try {
          const data = JSON.parse(line.slice(6))

          if (data.text) {
            if (assistantContent === '') setActivity(null)
            assistantContent += data.text
            setMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                role: 'assistant',
                content: assistantContent,
              }
              return updated
            })
          }

          if (data.event === 'tool_start') {
            setActivity(data.label ?? 'Pensando…')
          }
          if (data.event === 'tool_done') {
            setActivity(null)
            if (data.round_summary) {
              const summary = data.round_summary as RoundSummary
              const idx = currentAssistantIdxRef.current
              if (idx >= 0) {
                setRoundsByMsgIdx(prev => ({ ...prev, [idx]: summary }))
              }
            }
          }
          if (data.event === 'plan_assigned' && data.plan) {
            const plan = data.plan as AssignedPlan
            const idx = currentAssistantIdxRef.current
            if (idx >= 0) {
              setPlansByMsgIdx(prev => ({ ...prev, [idx]: plan }))
            }
          }

          if (data.done && data.session_id) {
            realSessionId = data.session_id
          }

          if (data.error) {
            setError(data.error)
          }
        } catch {
          // Línea malformada — saltar. Si vuelve a pasar consistentemente
          // es señal de bug del server, no del buffer (acá ya está completo).
        }
      }

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
          for (const line of frame.split('\n')) handleSseLine(line)
        }
      }
      // Flush final: aplica el resto del buffer + cualquier byte multi-byte
      // pendiente del último read.
      buffer += decoder.decode()
      for (const frame of buffer.split('\n\n')) {
        for (const line of frame.split('\n')) handleSseLine(line)
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
  }, [session, sessionId, router])

  const handleSend = () => {
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
    setInput('')
    sendFollowUp(newMessages)
  }

  // Reintentar tras error de conexión: descarta el placeholder assistant
  // que quedó vacío/parcial y rellama sendFollowUp con el último user turn.
  const handleRetry = () => {
    if (streaming) return
    const last = messages[messages.length - 1]
    const cleaned = last?.role === 'assistant'
      ? messages.slice(0, -1)
      : messages
    setMessages(cleaned)
    sendFollowUp(cleaned)
  }

  const handleRatingSubmit = async () => {
    if (!session || rating === 0 || ratingSubmitting) return
    setRatingSubmitting(true)
    try {
      const res = await fetch('/api/taiger/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          rating,
          comment: ratingComment.trim() || undefined,
        }),
      })
      if (res.ok) {
        setRatingSubmitted(true)
      }
    } catch {
      // silently fail
    } finally {
      setRatingSubmitting(false)
    }
  }

  const hasAssistantResponse = messages.some(m => m.role === 'assistant' && m.content.length > 0)
  const showRating = hasAssistantResponse && !streaming

  if (loadingSession) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-2)',
      }}>
        Cargando sesión...
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 20,
      }}>
        <p style={{ color: 'var(--text)', fontSize: 16 }}>Sesión no encontrada</p>
        <button
          onClick={() => router.push('/coach')}
          style={{
            background: 'rgba(196,153,42,0.15)',
            border: '1px solid rgba(196,153,42,0.3)',
            borderRadius: 8,
            padding: '8px 20px',
            color: '#8A6A16',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Volver al coach
        </button>
      </div>
    )
  }

  const inputDisabled = streaming
  const sessionDate = session?.created_at ? new Date(session.created_at).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 60px)' }}>
      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        paddingBottom: 100,
      }}>
        {/* Back link */}
        <Link href="/coach" style={{
          color: 'var(--text-2)', fontSize: '13px', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          marginBottom: '16px', minHeight: '44px',
        }}>
          ← Coach
        </Link>

        {/* Session header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            background: 'rgba(196,153,42,0.12)',
            border: '1px solid rgba(196,153,42,0.25)',
            borderRadius: 20,
            padding: '4px 14px',
            color: '#8A6A16',
            fontSize: 12,
            fontWeight: 500,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {SESSION_TYPE_ICONS[session?.session_type || '']}
              {SESSION_TYPE_LABELS[session?.session_type || ''] || session?.session_type}
            </span>
          </span>
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
            {sessionDate}
          </span>
        </div>

        {messages.length === 0 && opener && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: 16,
              gap: 8,
            }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(196,153,42,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0,
              marginTop: 2,
            }}>
              <TaigerIcon size={18} />
            </div>
            <div
              className="taiger-md"
              style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: '14px 14px 14px 4px',
                background: 'var(--bg-surface)',
                color: 'var(--text)',
                fontSize: 14,
                lineHeight: 1.6,
                wordBreak: 'break-word',
              }}
              data-testid="taiger-opener"
            >
              {opener}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 16,
              gap: 8,
            }}
          >
            {msg.role === 'assistant' && (
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(196,153,42,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
                marginTop: 2,
              }}>
                <TaigerIcon size={18} />
              </div>
            )}
            <div
              className={msg.role === 'assistant' ? 'taiger-md' : undefined}
              style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? 'rgba(196,153,42,0.12)' : 'var(--bg-surface)',
                color: 'var(--text)',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
                wordBreak: 'break-word',
              }}
            >
              {msg.role === 'assistant' && msg.content ? (
                <CitedMarkdown text={msg.content} round={roundsByMsgIdx[i]} />
              ) : (
                msg.content
              )}
            </div>
            {msg.role === 'assistant' && roundsByMsgIdx[i] && shouldRenderChart(msg.content) && (
              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: 40 }}>
                <RoundMiniChart summary={roundsByMsgIdx[i]} />
              </div>
            )}
            {msg.role === 'assistant' && plansByMsgIdx[i] && (
              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: 40 }}>
                <PlanAssignedCard
                  plan={plansByMsgIdx[i]}
                  onChangeFocus={() => {
                    setInput('Ese plan no me convence, propone otro foco distinto basado en mis datos.')
                  }}
                />
              </div>
            )}
          </div>
        ))}

        {streaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            margin: '8px 0 8px 40px',
            maxWidth: 'fit-content',
            background: 'rgba(196,153,42,0.08)',
            border: '1px solid rgba(196,153,42,0.20)',
            borderRadius: 20,
            fontSize: 13,
            color: '#8A6A16',
            fontWeight: 500,
          }}>
            <span className="taiger-spinner" style={{
              width: 12, height: 12, borderRadius: 6,
              background: '#c4992a',
              animation: 'taigerPulse 1.2s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span>{activity ?? 'tAIger+ está analizando…'}</span>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 10,
            padding: 16,
            marginTop: 12,
            color: '#fca5a5',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={handleRetry}
              disabled={streaming}
              style={{
                flexShrink: 0,
                background: streaming ? 'rgba(220,38,38,0.2)' : 'rgba(220,38,38,0.25)',
                border: '1px solid rgba(220,38,38,0.5)',
                color: '#fecaca',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 8,
                cursor: streaming ? 'not-allowed' : 'pointer',
                opacity: streaming ? 0.6 : 1,
                minHeight: 36,
              }}
            >
              {streaming ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}

        {/* Session Rating — se oculta una vez enviada para no dejar pill ruidosa */}
        {showRating && !ratingSubmitted && (
          <div style={{
            marginTop: 24,
            padding: 20,
            background: 'rgba(196,153,42,0.06)',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: 12,
          }}>
            {(
              <>
                <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                  Califica esta sesion con tAIger+
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 28,
                        padding: 4,
                        color: star <= (ratingHover || rating) ? '#c4992a' : '#3a4a5c',
                        transition: 'color 0.15s',
                        minWidth: 44,
                        minHeight: 44,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label={`${star} estrellas`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                  placeholder="Algun comentario? (opcional)"
                  style={{
                    width: '100%',
                    height: 40,
                    background: 'var(--bg)',
                    border: '1px solid rgba(196,153,42,0.2)',
                    borderRadius: 8,
                    padding: '0 12px',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                    marginBottom: 12,
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleRatingSubmit}
                  disabled={rating === 0 || ratingSubmitting}
                  style={{
                    width: '100%',
                    height: 40,
                    borderRadius: 8,
                    background: rating > 0 ? '#c4992a' : 'rgba(196,153,42,0.15)',
                    border: 'none',
                    color: rating > 0 ? 'var(--brand-dark)' : 'var(--text-2)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: rating > 0 ? 'pointer' : 'not-allowed',
                    opacity: ratingSubmitting ? 0.6 : 1,
                  }}
                >
                  {ratingSubmitting ? 'Enviando...' : 'Enviar'}
                </button>
              </>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-surface)',
        borderTop: '1px solid rgba(196,153,42,0.2)',
        padding: '12px 16px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        zIndex: 50,
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={streaming ? 'tAIger+ está escribiendo...' : 'Escribe tu mensaje...'}
          disabled={inputDisabled}
          style={{
            flex: 1,
            height: 48,
            background: 'var(--bg)',
            border: '1px solid rgba(196,153,42,0.3)',
            borderRadius: 10,
            padding: '0 16px',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
            opacity: inputDisabled ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={inputDisabled || !input.trim()}
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            background: inputDisabled || !input.trim() ? 'rgba(196,153,42,0.15)' : '#c4992a',
            border: 'none',
            color: inputDisabled || !input.trim() ? 'var(--text-2)' : 'var(--brand-dark)',
            fontSize: 18,
            cursor: inputDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes taigerPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.4; }
        }
        .taiger-md > *:first-child { margin-top: 0; }
        .taiger-md > *:last-child { margin-bottom: 0; }
        .taiger-md p { margin: 0 0 10px 0; }
        .taiger-md strong { color: #f3d37a; font-weight: 600; }
        .taiger-md em { color: #c4d8ee; }
        .taiger-md ul, .taiger-md ol { margin: 6px 0 10px 0; padding-left: 20px; }
        .taiger-md li { margin: 2px 0; }
        .taiger-md h1, .taiger-md h2, .taiger-md h3 {
          margin: 12px 0 6px 0; font-size: 15px; color: #f3d37a; font-weight: 600;
        }
        .taiger-md code {
          background: rgba(255,255,255,0.08); padding: 1px 6px;
          border-radius: 4px; font-size: 13px;
        }
        .taiger-md hr {
          border: none; border-top: 1px solid rgba(196,153,42,0.25); margin: 12px 0;
        }
        .taiger-md a { color: #c4992a; }
      `}</style>
    </div>
  )
}
