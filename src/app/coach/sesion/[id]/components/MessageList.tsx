'use client'

import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage, MessageVote } from '@/lib/data/taiger'
import { EmptyState } from './EmptyState'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: ChatMessage[]
  opener: string | null
  roundsByMsgIdx: Record<number, RoundSummary>
  projectionsByMsgIdx: Record<number, ScoreProjection>
  plansByMsgIdx: Record<number, AssignedPlan>
  onChangeFocus: () => void
  /** Votos 👍/👎 por índice de mensaje + handler. canVote=false oculta los pulgares. */
  votesByMsgIdx: Record<number, MessageVote>
  canVote: boolean
  streaming: boolean
  onVote: (messageIndex: number, clicked: MessageVote) => void
}

/**
 * Lista de mensajes del chat:
 * - opener (estado vacío) cuando no hay mensajes.
 * - cada mensaje vía MessageBubble, con 👍/👎 bajo las respuestas del coach que
 *   ya tienen contenido (no la que se está streameando en este momento).
 */
export function MessageList({
  messages,
  opener,
  roundsByMsgIdx,
  projectionsByMsgIdx,
  plansByMsgIdx,
  onChangeFocus,
  votesByMsgIdx,
  canVote,
  streaming,
  onVote,
}: MessageListProps) {
  const lastIdx = messages.length - 1
  // El primer mensaje 'user' marca dónde empieza la conversación real. El saludo
  // proactivo (opener) aparece antes y NO es votable: el backend lo descarta al
  // persistir, así que un voto sobre él se perdería al recargar.
  const firstUserIdx = messages.findIndex(m => m.role === 'user')
  return (
    <>
      {messages.length === 0 && opener && <EmptyState opener={opener} />}

      {messages.map((msg, i) => {
        const isStreamingThis = streaming && i === lastIdx
        const isReply = firstUserIdx !== -1 && i > firstUserIdx
        const showFeedback =
          canVote && msg.role === 'assistant' && !!msg.content && !isStreamingThis && isReply
        return (
          <MessageBubble
            key={i}
            msg={msg}
            round={roundsByMsgIdx[i]}
            projection={projectionsByMsgIdx[i]}
            plan={plansByMsgIdx[i]}
            onChangeFocus={onChangeFocus}
            showFeedback={showFeedback}
            vote={votesByMsgIdx[i]}
            onVote={(clicked) => onVote(i, clicked)}
          />
        )
      })}
    </>
  )
}
