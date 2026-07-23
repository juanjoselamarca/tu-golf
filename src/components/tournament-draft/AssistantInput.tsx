'use client'

// src/components/tournament-draft/AssistantInput.tsx
//
// Textarea + botón Enviar del AssistantPanel.
// - Enter envía. Shift+Enter inserta salto de línea.
// - Auto-grow vertical hasta 150px, después scroll interno.
// - Disabled cuando el panel está en loading o el texto está vacío.

import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface AssistantInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

const MAX_HEIGHT_PX = 150

export default function AssistantInput({
  onSend,
  disabled = false,
  placeholder = 'Describe el torneo...',
}: AssistantInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resetHeight = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
  }

  const autoGrow = () => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, MAX_HEIGHT_PX) + 'px'
  }

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    resetHeight()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const canSend = !disabled && text.trim().length > 0

  return (
    <div
      style={{
        borderTop: '1px solid var(--border, #e5e7eb)',
        padding: '10px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        background: '#fff',
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          autoGrow()
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Mensaje para el asistente"
        style={{
          flex: 1,
          resize: 'none',
          padding: '10px 12px',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: '12px',
          fontFamily: '"DM Sans", sans-serif',
          fontSize: '14px',
          lineHeight: 1.4,
          outline: 'none',
          minHeight: '40px',
          maxHeight: `${MAX_HEIGHT_PX}px`,
          background: disabled ? '#f3f4f6' : '#fff',
          color: 'var(--text-primary, #111827)',
        }}
      />
      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        aria-label="Enviar mensaje"
        style={{
          background: canSend ? 'var(--brand-gold, #c4992a)' : '#d1d5db',
          color: canSend ? 'var(--brand-dark, #0a1419)' : '#9ca3af',
          border: 'none',
          borderRadius: '12px',
          padding: '10px 16px',
          fontWeight: 600,
          fontSize: '14px',
          cursor: canSend ? 'pointer' : 'not-allowed',
          fontFamily: '"DM Sans", sans-serif',
          letterSpacing: '0.02em',
          transition: 'background-color 120ms ease, color 120ms ease',
        }}
      >
        Enviar
      </button>
    </div>
  )
}
