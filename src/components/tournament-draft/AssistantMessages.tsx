'use client'

// src/components/tournament-draft/AssistantMessages.tsx
//
// Render del scroll de mensajes del AssistantPanel. Componente puro: recibe
// la lista de mensajes y el flag de loading, no maneja estado propio salvo
// el scroll automático al fondo cuando llega un mensaje nuevo o cambia el
// estado de loading.
//
// Diseño:
// - Burbujas pegadas a izquierda (assistant + system) o derecha (user).
// - Assistant: borde gold a la izquierda (acento de marca).
// - System: fondo según severity (info / warning / error).
// - Sin emojis. Texto en DM Sans con line-height generoso.
// - Indicador "tAIger+ está pensando..." cuando loading=true.

import { useEffect, useRef } from 'react'
import type { AssistantMessage } from './types'

export interface AssistantMessagesProps {
  messages: AssistantMessage[]
  loading: boolean
}

function bubbleStyle(role: AssistantMessage['role'], severity?: AssistantMessage['severity']): React.CSSProperties {
  // User: gris claro, alineado a la derecha
  if (role === 'user') {
    return {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      background: 'rgba(10,20,25,0.05)',
      borderLeft: 'none',
      padding: '10px 14px',
      borderRadius: '12px',
      fontFamily: '"DM Sans", sans-serif',
      fontSize: '14px',
      color: 'var(--text-primary, #111827)',
      whiteSpace: 'pre-wrap',
      lineHeight: 1.5,
    }
  }

  // System: fondo según severity
  if (role === 'system') {
    const palette =
      severity === 'error'
        ? { bg: 'rgba(220,38,38,0.08)', border: '#dc2626', color: '#991b1b' }
        : severity === 'warning'
        ? { bg: 'rgba(234,179,8,0.10)', border: '#eab308', color: '#854d0e' }
        : { bg: 'rgba(10,20,25,0.04)', border: '#9ca3af', color: '#374151' }
    return {
      alignSelf: 'flex-start',
      maxWidth: '85%',
      background: palette.bg,
      borderLeft: `3px solid ${palette.border}`,
      padding: '10px 14px',
      borderRadius: '12px',
      fontFamily: '"DM Sans", sans-serif',
      fontSize: '13px',
      color: palette.color,
      whiteSpace: 'pre-wrap',
      lineHeight: 1.5,
    }
  }

  // Assistant default
  return {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    background: 'var(--card-bg, #f9fafb)',
    borderLeft: '3px solid var(--brand-gold, #c4992a)',
    padding: '10px 14px',
    borderRadius: '12px',
    fontFamily: '"DM Sans", sans-serif',
    fontSize: '14px',
    color: 'var(--text-primary, #111827)',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
  }
}

export default function AssistantMessages({ messages, loading }: AssistantMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {messages.map((m) => (
        <div key={m.id} style={bubbleStyle(m.role, m.severity)}>
          {m.text}
          {m.role === 'assistant' && m.needsConfirmation && m.needsConfirmation.length > 0 && (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 10px',
                background: 'rgba(196,153,42,0.08)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-secondary, #6b7280)',
                fontFamily: '"DM Sans", sans-serif',
              }}
            >
              Por confirmar: {m.needsConfirmation.join(', ')}
            </div>
          )}
        </div>
      ))}
      {loading && (
        <div
          style={{
            alignSelf: 'flex-start',
            background: 'var(--card-bg, #f9fafb)',
            borderLeft: '3px solid var(--brand-gold, #c4992a)',
            padding: '10px 14px',
            borderRadius: '12px',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: '14px',
            color: 'var(--text-secondary, #6b7280)',
            fontStyle: 'italic',
          }}
          aria-live="polite"
        >
          tAIger+ está pensando...
        </div>
      )}
      <div ref={endRef} />
    </div>
  )
}
