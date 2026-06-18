'use client'

interface RetryBarProps {
  error: string
  streaming: boolean
  onRetry: () => void
}

/**
 * Barra de error + reintento (idéntico al original page.tsx:584-618).
 */
export function RetryBar({ error, streaming, onRetry }: RetryBarProps) {
  return (
    <div style={{
      background: 'rgba(220,38,38,0.12)',
      border: '1px solid rgba(220,38,38,0.3)',
      borderRadius: 10,
      padding: 16,
      marginTop: 12,
      color: '#fca5a5',
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <span style={{ flex: 1 }}>{error}</span>
      <button
        onClick={onRetry}
        disabled={streaming}
        style={{
          flexShrink: 0,
          background: streaming ? 'rgba(220,38,38,0.2)' : 'rgba(220,38,38,0.25)',
          border: '1px solid rgba(220,38,38,0.5)',
          color: '#fecaca',
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 14px',
          borderRadius: 8,
          cursor: streaming ? 'not-allowed' : 'pointer',
          opacity: streaming ? 0.6 : 1,
          minHeight: 36,
        }}
      >
        {streaming ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}
