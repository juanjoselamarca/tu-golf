'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from '@/components/icons'
import { captureError } from '@/lib/error-tracking'

/**
 * Error boundary del chat de tAIger+ (/coach/sesion/[id]).
 *
 * Captura el error vía `captureError` para que crashes en el stream del LLM
 * o en el render de mensajes sean diagnosticables en producción. En dev o
 * `?debug=1` expone `error.message` + `error.digest`.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    captureError(error, {
      context: 'coach.session.render',
      meta: { digest: error.digest },
    })
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (process.env.NODE_ENV !== 'production' || params.get('debug') === '1') {
        setShowDebug(true)
      }
    }
  }, [error])

  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><AlertTriangle size={48} strokeWidth={1.5} /></div>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: '#edeae4', marginBottom: '8px' }}>Algo salió mal</h1>
      <p style={{ fontSize: '14px', color: '#94a8c0', marginBottom: '24px', maxWidth: '320px' }}>Estamos trabajando para solucionarlo. Intenta de nuevo o vuelve al inicio.</p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={reset} style={{ background: '#c4992a', color: '#070d18', fontWeight: 700, fontSize: '14px', padding: '12px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer' }}>Reintentar</button>
        <a href="/" style={{ color: '#8A6A16', fontWeight: 600, fontSize: '14px', padding: '12px 24px', borderRadius: '10px', textDecoration: 'none', border: '1px solid rgba(196,153,42,0.4)', display: 'flex', alignItems: 'center' }}>Inicio</a>
      </div>
      {showDebug && (
        <div style={{ marginTop: '24px', maxWidth: '420px', fontFamily: '"DM Mono", monospace', fontSize: '11px', color: '#94a8c0', background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '8px', padding: '12px 14px', textAlign: 'left', wordBreak: 'break-word' }}>
          <div style={{ color: '#ff8a8a', fontWeight: 600, marginBottom: '6px' }}>debug</div>
          <div>{error.message || '(sin mensaje)'}</div>
          {error.digest && <div style={{ marginTop: '6px', opacity: 0.7 }}>digest: {error.digest}</div>}
        </div>
      )}
    </div>
  )
}
