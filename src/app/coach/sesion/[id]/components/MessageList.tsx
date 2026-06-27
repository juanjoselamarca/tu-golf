'use client'

import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage, MessageVote } from '@/lib/data/taiger'
import type { ActivePlanSummary } from '@/golf/coach/intro'
import { EmptyState } from './EmptyState'
import { MessageBubble } from './MessageBubble'
import { SuggestionChips } from './SuggestionChips'

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
  /** Chips de arranque del estado vacío + handler (tocar = enviar). */
  chips?: string[]
  onChip?: (question: string) => void
  /** Plan activo (D3): surfacing en el estado vacío. */
  activePlan?: ActivePlanSummary | null
  /** Follow-up chips (D1) del último intercambio + handler (tocar = enviar). */
  followups?: string[]
  onFollowup?: (question: string) => void
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
  chips,
  onChip,
  activePlan,
  followups,
  onFollowup,
}: MessageListProps) {
  const lastIdx = messages.length - 1
  // El primer mensaje 'user' marca dónde empieza la conversación real. El saludo
  // proactivo (opener) aparece antes y NO es votable: el backend lo descarta al
  // persistir, así que un voto sobre él se perdería al recargar.
  const firstUserIdx = messages.findIndex(m => m.role === 'user')
  return (
    <>
      {messages.length === 0 && opener && <EmptyState opener={opener} chips={chips} onChip={onChip} activePlan={activePlan} />}

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

      {/* Follow-up chips (D1): bajo la ÚLTIMA respuesta del coach, solo cuando ya
          cerró el stream. marginLeft alinea con la burbuja del coach (avatar 32 + gap 8). */}
      {!streaming && followups && followups.length > 0 && onFollowup &&
        messages[lastIdx]?.role === 'assistant' && !!messages[lastIdx]?.content && (
          <SuggestionChips
            items={followups}
            onPick={onFollowup}
            ariaLabel="Seguir preguntando"
            containerStyle={{ marginTop: 10, marginBottom: 4, marginLeft: 40 }}
          />
        )}
    </>
  )
}
