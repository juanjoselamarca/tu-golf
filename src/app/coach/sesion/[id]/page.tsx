'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

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
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  post_round: '🏌️ Análisis post-ronda',
  weekly_plan: '📅 Plan semanal',
  free: '💬 Consulta libre',
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
  const [limitReached, setLimitReached] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const MAX_TOTAL_MESSAGES = 5

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const loadSession = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login?redirect=/coach'); return }

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

      setSession(sessionData as TaigerSession)
      setMessages(sessionData.messages || [])
      setLoadingSession(false)
    }

    loadSession()
  }, [sessionId, router])

  const sendFollowUp = useCallback(async (allMessages: ChatMessage[]) => {
    if (!session) return
    setStreaming(true)
    setError(null)

    try {
      const res = await fetch('/api/taiger/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          session_type: session.session_type,
        }),
      })

      if (res.status === 429) {
        const data = await res.json()
        if (data.code === 'limit_reached') {
          setLimitReached(true)
          setError('Has alcanzado el límite de sesiones de tu plan gratuito.')
          setStreaming(false)
          return
        }
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Error al conectar con tAIger+')
        setStreaming(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))

            if (data.text) {
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

            if (data.error) {
              setError(data.error)
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      // Update session in DB with new messages
      const supabase = createClient()
      setMessages(prev => {
        const finalMessages = [...prev]
        supabase
          .from('taiger_sessions')
          .update({ messages: finalMessages, updated_at: new Date().toISOString() })
          .eq('id', sessionId)
          .then()
        return finalMessages
      })
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setStreaming(false)
    }
  }, [session, sessionId])

  const handleSend = () => {
    if (!input.trim() || streaming) return
    if (messages.length >= MAX_TOTAL_MESSAGES) return

    const userMessage: ChatMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    sendFollowUp(newMessages)
  }

  if (loadingSession) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a8c0',
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
        <p style={{ color: '#edeae4', fontSize: 16 }}>Sesión no encontrada</p>
        <button
          onClick={() => router.push('/coach')}
          style={{
            background: 'rgba(196,153,42,0.15)',
            border: '1px solid rgba(196,153,42,0.3)',
            borderRadius: 8,
            padding: '8px 20px',
            color: '#c4992a',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Volver al coach
        </button>
      </div>
    )
  }

  const inputDisabled = streaming || messages.length >= MAX_TOTAL_MESSAGES || limitReached
  const sessionDate = session?.created_at ? new Date(session.created_at).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        paddingBottom: 100,
      }}>
        {/* Back link */}
        <Link href="/coach" style={{
          color: '#94a8c0', fontSize: '13px', textDecoration: 'none',
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
            color: '#c4992a',
            fontSize: 12,
            fontWeight: 500,
          }}>
            {SESSION_TYPE_LABELS[session?.session_type || ''] || session?.session_type}
          </span>
          <span style={{ color: '#94a8c0', fontSize: 12 }}>
            {sessionDate}
          </span>
        </div>

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
                🐯
              </div>
            )}
            <div style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user' ? 'rgba(196,153,42,0.12)' : '#0e1c2f',
              color: '#edeae4',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {streaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
          <div style={{
            color: '#c4992a',
            fontSize: 14,
            fontWeight: 500,
            padding: '8px 0',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            tAIger+ está analizando...
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
          }}>
            {error}
            {limitReached && (
              <button
                onClick={() => router.push('/coach')}
                style={{
                  display: 'block',
                  marginTop: 12,
                  background: 'rgba(196,153,42,0.15)',
                  border: '1px solid rgba(196,153,42,0.3)',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: '#c4992a',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Entendido
              </button>
            )}
          </div>
        )}

        {messages.length >= MAX_TOTAL_MESSAGES && !streaming && (
          <div style={{
            textAlign: 'center',
            marginTop: 20,
            padding: 16,
          }}>
            <p style={{ color: '#94a8c0', fontSize: 14 }}>
              Sesión completada
            </p>
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
        background: '#0e1c2f',
        borderTop: '1px solid rgba(196,153,42,0.2)',
        padding: '12px 16px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={inputDisabled ? 'Sesión completada' : 'Escribe tu mensaje...'}
          disabled={inputDisabled}
          style={{
            flex: 1,
            height: 48,
            background: '#070d18',
            border: '1px solid rgba(196,153,42,0.3)',
            borderRadius: 10,
            padding: '0 16px',
            color: '#edeae4',
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
            color: inputDisabled || !input.trim() ? '#94a8c0' : '#070d18',
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
      `}</style>
    </div>
  )
}
