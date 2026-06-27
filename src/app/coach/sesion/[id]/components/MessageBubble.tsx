'use client'

import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { CitedMarkdown } from '@/components/coach/CitedMarkdown'
import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage, MessageVote } from '@/lib/data/taiger'
import { AssistantCards } from './AssistantCard'
import { MessageFeedback } from './MessageFeedback'

interface MessageBubbleProps {
  msg: ChatMessage
  round?: RoundSummary
  projection?: ScoreProjection
  plan?: AssignedPlan
  onChangeFocus: () => void
  /** Muestra 👍/👎 bajo la respuesta del coach (solo assistant con contenido, no en stream). */
  showFeedback?: boolean
  vote?: MessageVote
  onVote?: (clicked: MessageVote) => void
}

/**
 * Una fila de mensaje (usuario o assistant): avatar + burbuja + cards de datos,
 * con 👍/👎 opcional bajo las respuestas del coach.
 *
 * Una respuesta del assistant SIN contenido no renderiza burbuja (evita el cuadro
 * vacío cuando el stream se corta antes del primer token — D6; durante el stream
 * el placeholder lo cubre la ActivityLine).
 */
export function MessageBubble({
  msg, round, projection, plan, onChangeFocus, showFeedback, vote, onVote,
}: MessageBubbleProps) {
  if (msg.role === 'assistant' && !msg.content) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
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
            // Coach: panel sólido (var(--bg-surface)). Usuario: burbuja crisp con borde
            // dorado fino + fill sutil — el gold plano al 12% sobre el navy se veía turbio.
            background: msg.role === 'user' ? 'rgba(196,153,42,0.08)' : 'var(--bg-surface)',
            border: msg.role === 'user' ? '1px solid rgba(196,153,42,0.30)' : '1px solid var(--line)',
            color: 'var(--text)',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
          }}
        >
          {msg.role === 'assistant' && msg.content ? (
            <CitedMarkdown text={msg.content} round={round} />
          ) : (
            msg.content
          )}
        </div>
        {msg.role === 'assistant' && (
          <AssistantCards
            content={msg.content}
            round={round}
            projection={projection}
            plan={plan}
            onChangeFocus={onChangeFocus}
          />
        )}
      </div>
      {showFeedback && onVote && <MessageFeedback vote={vote} onVote={onVote} />}
    </div>
  )
}
