'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Calendar } from '@/components/icons'
import { TaigerIcon } from '@/components/icons/TaigerIcon'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function ChatContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tipo = searchParams.get('tipo') || 'free'

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialSent = useRef(false)

  // Coach real no corta la conversación prematuramente. 25 turnos del usuario
  // cubre prácticamente cualquier análisis post-ronda sin cortar mid-sesión.
  const MAX_MESSAGES = 25

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessages = useCallback(async (allMessages: ChatMessage[]) => {
    setStreaming(true)
    setError(null)

    try {
      const res = await fetch('/api/taiger/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          session_type: tipo === 'weekly_plan' ? 'weekly_plan' : 'free',
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

            if (data.done && data.session_id) {
              setSessionId(data.session_id)
            }

            if (data.error) {
              setError(data.error)
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setStreaming(false)
    }
  }, [tipo])

  // Auto-send first message for weekly_plan
  useEffect(() => {
    if (initialSent.current) return
    if (tipo === 'weekly_plan') {
      initialSent.current = true
      const firstMessage: ChatMessage = {
        role: 'user',
        content: 'Necesito un plan de práctica para esta semana',
      }
      setMessages([firstMessage])
      sendMessages([firstMessage])
    } else {
      initialSent.current = true
    }
  }, [tipo, sendMessages])

  const handleSend = () => {
    if (!input.trim() || streaming) return

    const userMessages = messages.filter(m => m.role === 'user')
    const maxUserMessages = tipo === 'weekly_plan' ? MAX_MESSAGES - 1 : MAX_MESSAGES
    if (userMessages.length >= maxUserMessages) {
      setSessionCompleted(true)
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    sendMessages(newMessages)

    // Check if this was the last allowed message
    const newUserCount = newMessages.filter(m => m.role === 'user').length
    if (newUserCount >= maxUserMessages) {
      setSessionCompleted(true)
    }
  }

  const userMessageCount = messages.filter(m => m.role === 'user').length
  const maxUserMessages = tipo === 'weekly_plan' ? MAX_MESSAGES - 1 : MAX_MESSAGES
  const inputDisabled = streaming || sessionCompleted || userMessageCount >= maxUserMessages || limitReached

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        // Deja espacio para el input fijo del chat (48px alto + paddings + safe-area)
        paddingBottom: 96,
      }}>
        {/* Session type badge */}
        <div style={{
          display: 'inline-block',
          background: 'rgba(196,153,42,0.12)',
          border: '1px solid rgba(196,153,42,0.25)',
          borderRadius: 20,
          padding: '4px 14px',
          color: '#c4992a',
          fontSize: 12,
          fontWeight: 500,
          marginBottom: 20,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {tipo === 'weekly_plan' && <Calendar size={14} />}
            {tipo === 'weekly_plan' ? 'Plan semanal' : 'Consulta libre'}
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
                <TaigerIcon size={18} />
              </div>
            )}
            <div
              className={msg.role === 'assistant' ? 'taiger-md' : undefined}
              style={{
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? 'rgba(196,153,42,0.12)' : '#0e1c2f',
                color: '#edeae4',
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
                wordBreak: 'break-word',
              }}
            >
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                ) : null
              ) : (
                msg.content
              )}
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
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <a
                  href="https://wa.me/56912345678?text=Quiero%20tAIger%2B%20Premium"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    background: '#25d366',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Quiero acceso ilimitado
                </a>
                <button
                  onClick={() => router.push('/coach')}
                  style={{
                    background: 'rgba(196,153,42,0.15)',
                    border: '1px solid rgba(196,153,42,0.3)',
                    borderRadius: 8,
                    padding: '8px 16px',
                    color: '#c4992a',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Volver
                </button>
              </div>
            )}
          </div>
        )}

        {sessionCompleted && !streaming && (
          <div style={{
            textAlign: 'center',
            marginTop: 20,
            padding: 16,
          }}>
            <p style={{ color: '#94a8c0', fontSize: 14, marginBottom: 12 }}>
              Sesión completada
            </p>
            {sessionId && (
              <button
                onClick={() => router.push(`/coach/sesion/${sessionId}`)}
                style={{
                  background: 'rgba(196,153,42,0.15)',
                  border: '1px solid rgba(196,153,42,0.3)',
                  borderRadius: 8,
                  padding: '8px 20px',
                  color: '#c4992a',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Ver sesión guardada
              </button>
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
        .taiger-md > *:first-child { margin-top: 0; }
        .taiger-md > *:last-child { margin-bottom: 0; }
        .taiger-md p { margin: 0 0 10px 0; }
        .taiger-md strong { color: #f3d37a; font-weight: 600; }
        .taiger-md em { color: #c4d8ee; }
        .taiger-md ul, .taiger-md ol { margin: 6px 0 10px 0; padding-left: 20px; }
        .taiger-md li { margin: 2px 0; }
        .taiger-md h1, .taiger-md h2, .taiger-md h3 {
          margin: 12px 0 6px 0;
          font-size: 15px;
          color: #f3d37a;
          font-weight: 600;
        }
        .taiger-md code {
          background: rgba(255,255,255,0.08);
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 13px;
        }
        .taiger-md hr {
          border: none;
          border-top: 1px solid rgba(196,153,42,0.25);
          margin: 12px 0;
        }
        .taiger-md a { color: #c4992a; }
      `}</style>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: 'calc(100vh - 60px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a8c0',
      }}>
        Cargando...
      </div>
    }>
      <ChatContent />
    </Suspense>
  )
}
