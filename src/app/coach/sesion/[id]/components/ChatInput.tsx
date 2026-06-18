'use client'

interface ChatInputProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  streaming: boolean
}

/**
 * Barra de entrada fija al pie (idéntico al original page.tsx:706-761).
 * - Enter envía.
 * - Deshabilitada mientras streaming.
 * El cambio a voseo + Shift+Enter + teclado mobile es PR2.
 */
export function ChatInput({ value, onChange, onSend, streaming }: ChatInputProps) {
  const inputDisabled = streaming
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--bg-surface)',
      borderTop: '1px solid rgba(196,153,42,0.2)',
      padding: '12px 16px',
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      zIndex: 50,
    }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSend()}
        placeholder={streaming ? 'tAIger+ está escribiendo...' : 'Escribe tu mensaje...'}
        disabled={inputDisabled}
        style={{
          flex: 1,
          height: 48,
          background: 'var(--bg)',
          border: '1px solid rgba(196,153,42,0.3)',
          borderRadius: 10,
          padding: '0 16px',
          color: 'var(--text)',
          fontSize: 14,
          outline: 'none',
          opacity: inputDisabled ? 0.5 : 1,
        }}
      />
      <button
        onClick={onSend}
        disabled={inputDisabled || !value.trim()}
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
