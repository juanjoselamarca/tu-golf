'use client'

import { useEffect, useRef } from 'react'

interface ChatInputProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  streaming: boolean
  /** Alto (px) que el teclado virtual tapa del fondo; sube el input sobre el teclado (D7). */
  keyboardInset: number
}

const MIN_H = 48
const MAX_H = 140

/**
 * ¿Esta tecla debe ENVIAR? Enter sin Shift envía; Shift+Enter es salto de línea.
 * Función PURA (testeable) — la regla de teclado es el corazón del cambio de UX.
 */
export function isSendKey(key: string, shiftKey: boolean): boolean {
  return key === 'Enter' && !shiftKey
}

/**
 * Barra de entrada fija al pie, optimizada para una mano en cancha (D7/D8):
 * - textarea multilínea: Enter envía, Shift+Enter salta de línea.
 * - auto-crece hasta MAX_H y luego scrollea.
 * - se eleva sobre el teclado virtual (keyboardInset) sin doble offset con el
 *   safe-area: cuando el teclado está abierto, su área tapa el safe-area inset,
 *   así que NO sumamos env(safe-area-inset-bottom) en ese caso (E6c).
 * - touch targets de 48px (botón + alto mínimo del textarea).
 */
export function ChatInput({ value, onChange, onSend, streaming, keyboardInset }: ChatInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const inputDisabled = streaming
  const keyboardOpen = keyboardInset > 0

  // Auto-grow: ajusta el alto al contenido (entre MIN_H y MAX_H). Corre en cada
  // cambio de value para que el reset tras enviar vuelva a una línea.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(MAX_H, Math.max(MIN_H, ta.scrollHeight))}px`
  }, [value])

  return (
    <div style={{
      position: 'fixed',
      bottom: keyboardInset,
      left: 0,
      right: 0,
      background: 'var(--bg-surface)',
      borderTop: '1px solid rgba(196,153,42,0.2)',
      padding: '12px 16px',
      // Sin teclado: respeta el safe-area del notch/home indicator. Con teclado:
      // el área tapada ya está compensada por `bottom`, sumar safe-area sería doble.
      paddingBottom: keyboardOpen ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-end',
      zIndex: 50,
    }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (isSendKey(e.key, e.shiftKey)) {
            e.preventDefault()
            onSend()
          }
        }}
        rows={1}
        placeholder={streaming ? 'tAIger+ está escribiendo…' : 'Escribí tu mensaje…'}
        disabled={inputDisabled}
        style={{
          flex: 1,
          minHeight: MIN_H,
          maxHeight: MAX_H,
          resize: 'none',
          background: 'var(--bg)',
          border: '1px solid rgba(196,153,42,0.3)',
          borderRadius: 10,
          padding: '13px 16px',
          color: 'var(--text)',
          fontSize: 16,
          lineHeight: 1.4,
          fontFamily: 'inherit',
          outline: 'none',
          opacity: inputDisabled ? 0.5 : 1,
          overflowY: 'auto',
        }}
      />
      <button
        onClick={onSend}
        disabled={inputDisabled || !value.trim()}
        aria-label="Enviar mensaje"
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: inputDisabled || !value.trim() ? 'rgba(196,153,42,0.15)' : '#c4992a',
          border: 'none',
          color: inputDisabled || !value.trim() ? 'var(--text-2)' : 'var(--brand-dark)',
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
  )
}
