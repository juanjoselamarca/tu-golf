'use client'

interface DiscardRoundButtonProps {
  confirmDiscard: boolean
  discarding: boolean
  onClick: () => void
}

/** Descartar ronda — dos pasos (toca otra vez), destructivo sutil. */
export function DiscardRoundButton({ confirmDiscard, discarding, onClick }: DiscardRoundButtonProps) {
  return (
    <div style={{ padding: '0 16px 12px', textAlign: 'center' }}>
      <button
        onClick={onClick}
        disabled={discarding}
        aria-label={confirmDiscard ? 'Confirmar descarte' : 'Descartar ronda'}
        style={{
          background: confirmDiscard ? 'rgba(220,38,38,0.1)' : 'transparent',
          border: confirmDiscard ? '1px solid rgba(220,38,38,0.5)' : '1px solid transparent',
          color: confirmDiscard ? 'var(--double)' : 'var(--text-3)',
          fontSize: '14px', fontWeight: confirmDiscard ? 600 : 400,
          padding: '8px 14px', borderRadius: '8px',
          cursor: discarding ? 'not-allowed' : 'pointer',
          opacity: discarding ? 0.5 : 1,
          letterSpacing: '0.02em',
          WebkitTapHighlightColor: 'transparent',
          transition: 'all 0.2s ease',
        }}
      >{discarding ? 'Descartando…' : confirmDiscard ? 'Toca otra vez para borrar todo' : 'Descartar ronda'}</button>
    </div>
  )
}
