'use client'

import { RouteErrorBoundary } from '@/components/ui/RouteErrorBoundary'

// Si el armado del leaderboard en vivo falla en el servidor (p. ej. statement
// timeout), la pantalla de error con "Reintentar" — no la página en blanco.
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary context="torneo.en-vivo.render" {...props} />
}
