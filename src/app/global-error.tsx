'use client'

import { useEffect } from 'react'
import { captureError } from '@/lib/error-tracking'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void captureError(error, {
      context: 'global-error-boundary',
      level: 'fatal',
      meta: error.digest ? { digest: error.digest } : {},
    })
  }, [error])

  return (
    <html lang="es">
      <body style={{
        background: '#070d18',
        color: '#edeae4',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        textAlign: 'center',
        padding: '20px',
      }}>
        <div>
          <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Algo salió mal</h1>
          <p style={{ color: '#94a8c0', marginBottom: '24px' }}>
            El error fue reportado automáticamente. Intenta recargar.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#c4992a',
              color: '#070d18',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
