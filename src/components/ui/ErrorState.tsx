'use client'

import { AlertTriangle } from '@/components/icons'

interface ErrorStateProps {
  message:  string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }} role="alert">
      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><AlertTriangle size={32} strokeWidth={1.5} /></div>
      <p style={{ color: 'var(--text)', marginBottom: '8px', fontSize: '15px' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background:   '#c4992a',
            color:        'var(--brand-dark)',
            border:       'none',
            padding:      '10px 24px',
            borderRadius: '8px',
            cursor:       'pointer',
            fontWeight:   700,
            fontSize:     '14px',
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  )
}
