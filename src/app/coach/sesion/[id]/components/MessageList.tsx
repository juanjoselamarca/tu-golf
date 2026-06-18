'use client'

import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage } from '@/lib/data/taiger'
import { EmptyState } from './EmptyState'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: ChatMessage[]
  opener: string | null
  roundsByMsgIdx: Record<number, RoundSummary>
  projectionsByMsgIdx: Record<number, ScoreProjection>
  plansByMsgIdx: Record<number, AssignedPlan>
  onChangeFocus: () => void
}

/**
 * Lista de mensajes del chat. Render idéntico al original:
 * - opener (estado vacío) cuando no hay mensajes (page.tsx:448-488).
 * - cada mensaje vía MessageBubble (page.tsx:490-557).
 */
export function MessageList({
  messages,
  opener,
  roundsByMsgIdx,
  projectionsByMsgIdx,
  plansByMsgIdx,
  onChangeFocus,
}: MessageListProps) {
  return (
    <>
      {messages.length === 0 && opener && <EmptyState opener={opener} />}

      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          msg={msg}
          round={roundsByMsgIdx[i]}
          projection={projectionsByMsgIdx[i]}
          plan={plansByMsgIdx[i]}
          onChangeFocus={onChangeFocus}
        />
      ))}
    </>
  )
}
