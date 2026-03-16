'use client'

interface ErrorStateProps {
  message:  string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }} role="alert">
      <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
      <p style={{ color: '#edeae4', marginBottom: '8px', fontSize: '15px' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background:   '#c4992a',
            color:        '#070d18',
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
