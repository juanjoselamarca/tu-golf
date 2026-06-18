'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTaigerSession } from './hooks/useTaigerSession'
import { useTaigerIntro } from './hooks/useTaigerIntro'
import { useTaigerChat } from './hooks/useTaigerChat'
import { useTaigerFeedback } from './hooks/useTaigerFeedback'
import { LoadingState, NotFoundState } from './components/SessionStates'
import { SessionHeader } from './components/SessionHeader'
import { MessageList } from './components/MessageList'
import { ActivityLine } from './components/ActivityLine'
import { RetryBar } from './components/RetryBar'
import { SessionRating } from './components/SessionRating'
import { ChatInput } from './components/ChatInput'
import { ChatStyles } from './components/ChatStyles'

export default function SesionDetailPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { session, notFound, loadingSession, messages, setMessages, initialRating } =
    useTaigerSession(sessionId)
  const { opener, setOpener } = useTaigerIntro(loadingSession, messages.length)
  const {
    streaming, error, activity,
    plansByMsgIdx, roundsByMsgIdx, projectionsByMsgIdx,
    handleSend, handleRetry,
  } = useTaigerChat({ session, sessionId, messages, setMessages, opener, setOpener })
  const {
    rating, setRating, ratingHover, setRatingHover,
    ratingComment, setRatingComment, ratingSubmitted, ratingSubmitting,
    handleRatingSubmit,
  } = useTaigerFeedback(session, initialRating)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onSend = () => {
    if (!input.trim() || streaming) return
    handleSend(input)
    setInput('')
  }

  if (loadingSession) return <LoadingState />
  if (notFound) return <NotFoundState />

  const hasAssistantResponse = messages.some(m => m.role === 'assistant' && m.content.length > 0)
  const showRating = hasAssistantResponse && !streaming
  const sessionDate = session?.created_at
    ? new Date(session.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 60px)' }}>
      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        paddingBottom: 100,
      }}>
        <SessionHeader sessionType={session?.session_type || ''} sessionDate={sessionDate} />

        <MessageList
          messages={messages}
          opener={opener}
          roundsByMsgIdx={roundsByMsgIdx}
          projectionsByMsgIdx={projectionsByMsgIdx}
          plansByMsgIdx={plansByMsgIdx}
          onChangeFocus={() =>
            setInput('Ese plan no me convence, propone otro foco distinto basado en mis datos.')
          }
        />

        {streaming && messages.length > 0 && !messages[messages.length - 1]?.content && (
          <ActivityLine activity={activity} />
        )}

        {error && <RetryBar error={error} streaming={streaming} onRetry={handleRetry} />}

        {/* Session Rating — se oculta una vez enviada para no dejar pill ruidosa */}
        {showRating && !ratingSubmitted && (
          <SessionRating
            rating={rating}
            setRating={setRating}
            ratingHover={ratingHover}
            setRatingHover={setRatingHover}
            ratingComment={ratingComment}
            setRatingComment={setRatingComment}
            ratingSubmitting={ratingSubmitting}
            onSubmit={handleRatingSubmit}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput value={input} onChange={setInput} onSend={onSend} streaming={streaming} />

      <ChatStyles />
    </div>
  )
}
