'use client'

import { useEffect, useState } from 'react'
import { ErrorScreen } from '@/components/ui/ErrorScreen'
import { captureError } from '@/lib/error-tracking'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
  /** Identificador semántico de la ruta para telemetría — ej: 'dashboard.render', 'coach.session.render'. Llega a `source` en error_logs y a `context` en PostHog. */
  context: string
  /** Override del CTA "Inicio". Default '/'. */
  homeHref?: string
}

/**
 * RouteErrorBoundary — wrapper client de <ErrorScreen> con observabilidad.
 *
 * Razón de ser (post-incidente 19-may-2026): el patrón histórico de los
 * archivos `app/**\/error.tsx` era destructurar solo `{ reset }` y descartar
 * el `error` prop. Resultado: caídas en producción invisibles, error_logs
 * vacía por semanas, diagnóstico solo por reporte de usuario. Este wrapper
 * cierra el agujero: cada boundary llama `captureError` con su contexto
 * único y muestra `error.message` + `error.digest` cuando estamos en dev o
 * el usuario fuerza `?debug=1` (útil para diagnóstico en celular).
 *
 * Uso (1 archivo por ruta, 3 líneas):
 *
 *   'use client'
 *   import { RouteErrorBoundary } from '@/components/ui/RouteErrorBoundary'
 *   export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
 *     return <RouteErrorBoundary context="dashboard.render" {...props} />
 *   }
 *
 * Regla anti-regresión: el canario en `canary-stability.test.ts` exige que
 * cada `app/**\/error.tsx` use este componente. No bypassear sin razón.
 */
export function RouteErrorBoundary({ error, reset, context, homeHref = '/' }: Props) {
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    captureError(error, { context, meta: { digest: error.digest } })
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (process.env.NODE_ENV !== 'production' || params.get('debug') === '1') {
        setShowDebug(true)
      }
    }
  }, [error, context])

  return (
    <>
      <ErrorScreen onRetry={reset} homeHref={homeHref} errorCode={error.digest} />
      {showDebug && (
        <div
          style={{
            margin: '0 auto 24px',
            maxWidth: '480px',
            padding: '12px 14px',
            background: 'rgba(255,80,80,0.06)',
            border: '1px solid rgba(255,80,80,0.25)',
            borderRadius: '8px',
            fontFamily: 'var(--font-dm-mono), monospace',
            fontSize: '11px',
            color: 'var(--text-2)',
            textAlign: 'left',
            wordBreak: 'break-word',
          }}
        >
          <div style={{ color: '#ff8a8a', fontWeight: 600, marginBottom: '6px' }}>
            debug ({context})
          </div>
          <div>{error.message || '(sin mensaje)'}</div>
          {error.digest && (
            <div style={{ marginTop: '6px', opacity: 0.7 }}>digest: {error.digest}</div>
          )}
        </div>
      )}
    </>
  )
}
