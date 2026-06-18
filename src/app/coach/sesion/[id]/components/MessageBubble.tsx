'use client'

import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { CitedMarkdown } from '@/components/coach/CitedMarkdown'
import type { AssignedPlan } from '@/components/coach/PlanAssignedCard'
import type { RoundSummary } from '@/components/coach/RoundMiniChart'
import type { ScoreProjection } from '@/components/coach/ScoreProjectionCard'
import type { ChatMessage } from '@/lib/data/taiger'
import { AssistantCards } from './AssistantCard'

interface MessageBubbleProps {
  msg: ChatMessage
  round?: RoundSummary
  projection?: ScoreProjection
  plan?: AssignedPlan
  onChangeFocus: () => void
}

/**
 * Una fila de mensaje (usuario o assistant): avatar + burbuja + cards de datos.
 * Render idéntico al original (page.tsx:490-556).
 */
export function MessageBubble({ msg, round, projection, plan, onChangeFocus }: MessageBubbleProps) {
  return (
    <div
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
  )
}
