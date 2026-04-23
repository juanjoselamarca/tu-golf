'use client'

import Link from 'next/link'
import { AlertTriangle } from '@/components/icons'
import { Button } from '@/components/ui/Button'

interface ErrorScreenProps {
  title?: string
  description?: string
  errorCode?: string
  onRetry?: () => void
  retryHref?: string
  homeHref?: string
  reportable?: boolean
}

/**
 * ErrorScreen Golfers+ — pantalla unificada de error full-page (audit H01).
 *
 * Reemplaza pantallas dark con "Algo salió mal" hardcodeadas. Respeta el
 * modo claro/oscuro del contexto via classes que heredan del parent.
 *
 * Distinto de `<ErrorState>` (inline simple, usado en widgets): este es
 * full-page con CTAs de recuperación.
 *
 * Uso:
 *   <ErrorScreen onRetry={() => reset()} homeHref="/" errorCode="ABC123" />
 */
export function ErrorScreen({
  title = 'Algo salió mal',
  description = 'Estamos trabajando para solucionarlo. Intenta de nuevo o vuelve al inicio.',
  errorCode,
  onRetry,
  retryHref,
  homeHref = '/',
  reportable = true,
}: ErrorScreenProps) {
  const mailBody = errorCode
    ? `Hola Golfers+, vi un error con código ${errorCode}.`
    : 'Hola Golfers+, vi un error en la app.'
  const mailto = `mailto:juanjoselamarca@gmail.com?subject=${encodeURIComponent('Error en Golfers+')}&body=${encodeURIComponent(mailBody)}`

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand/10 mb-6">
          <AlertTriangle className="w-8 h-8 text-brand" />
        </div>

        <h1
          className="text-2xl sm:text-3xl font-bold mb-3 text-gray-900 dark:text-white"
          style={{ fontFamily: 'var(--font-playfair), serif' }}
        >
          {title}
        </h1>

        <p className="text-base text-gray-600 dark:text-white/70 mb-6 leading-relaxed">
          {description}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
          {retryHref ? (
            <Link href={retryHref}>
              <Button variant="commit" size="md">Reintentar</Button>
            </Link>
          ) : onRetry ? (
            <Button variant="commit" size="md" onClick={onRetry}>Reintentar</Button>
          ) : null}

          <Link href={homeHref}>
            <Button variant="nav" size="md">Inicio</Button>
          </Link>
        </div>

        {errorCode && (
          <p
            className="text-xs text-gray-500 dark:text-white/50 mt-6"
            style={{ fontFamily: 'var(--font-dm-mono), monospace' }}
          >
            Código: {errorCode}
          </p>
        )}

        {reportable && (
          <p className="text-xs text-gray-500 dark:text-white/50 mt-3">
            <a href={mailto} className="text-brand hover:underline">
              Reportar este error
            </a>
          </p>
        )}
      </div>
    </div>
  )
}
