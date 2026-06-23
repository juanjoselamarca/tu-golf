'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTaigerSession } from './hooks/useTaigerSession'
import { useTaigerIntro } from './hooks/useTaigerIntro'
import { useTaigerChat } from './hooks/useTaigerChat'
import { useMessageFeedback } from './hooks/useMessageFeedback'
import { useVisualViewport } from './hooks/useVisualViewport'
import { LoadingState, NotFoundState } from './components/SessionStates'
import { SessionHeader } from './components/SessionHeader'
import { MessageList } from './components/MessageList'
import { ActivityLine } from './components/ActivityLine'
import { RetryBar } from './components/RetryBar'
import { ChatInput } from './components/ChatInput'
import { ChatStyles } from './components/ChatStyles'

export default function SesionDetailPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollPendingRef = useRef(false)
  const keyboardInset = useVisualViewport()

  const { session, notFound, loadingSession, messages, setMessages } =
    useTaigerSession(sessionId)
  const { opener, setOpener } = useTaigerIntro(loadingSession, messages.length)
  const {
    streaming, error, activity,
    plansByMsgIdx, roundsByMsgIdx, projectionsByMsgIdx,
    handleSend, handleRetry,
  } = useTaigerChat({ session, sessionId, messages, setMessages, opener, setOpener })
  const { votesByMsgIdx, canVote, submitVote } = useMessageFeedback(sessionId, messages)

  // Autoscroll al fondo. Durante el stream: behavior 'auto' + throttle por frame
  // (smooth por token genera jank — E6b). Fuera del stream y al abrir teclado:
  // 'smooth'. keyboardInset en deps mantiene visible el último mensaje al subir
  // el input sobre el teclado.
  useEffect(() => {
    const el = messagesEndRef.current
    if (!el) return
    if (streaming) {
      if (scrollPendingRef.current) return
      scrollPendingRef.current = true
      requestAnimationFrame(() => {
        scrollPendingRef.current = false
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      })
    } else {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming, keyboardInset])

  const onSend = () => {
    if (!input.trim() || streaming) return
    handleSend(input)
    setInput('')
  }

  if (loadingSession) return <LoadingState />
  if (notFound) return <NotFoundState />

  const sessionDate = session?.created_at
    ? new Date(session.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 60px)' }}>
      {/* Messages area. paddingBottom deja sitio para el input fijo + el teclado
          (cuando sube el input) para que el último mensaje quede visible. */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        paddingBottom: 100 + keyboardInset,
      }}>
        <SessionHeader sessionType={session?.session_type || ''} sessionDate={sessionDate} />

        <MessageList
          messages={messages}
          opener={opener}
          roundsByMsgIdx={roundsByMsgIdx}
          projectionsByMsgIdx={projectionsByMsgIdx}
          plansByMsgIdx={plansByMsgIdx}
          onChangeFocus={() =>
            setInput('Ese plan no me convence, propón otro foco distinto basado en mis datos.')
          }
          votesByMsgIdx={votesByMsgIdx}
          canVote={canVote}
          streaming={streaming}
          onVote={submitVote}
        />

        {streaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
          <ActivityLine activity={activity} />
        )}

        {error && <RetryBar error={error} streaming={streaming} onRetry={handleRetry} />}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSend={onSend}
        streaming={streaming}
        keyboardInset={keyboardInset}
      />

      <ChatStyles />
    </div>
  )
}
