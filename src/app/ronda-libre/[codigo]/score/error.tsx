'use client'

import { RouteErrorBoundary } from '@/components/ui/RouteErrorBoundary'

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorBoundary context="ronda-libre.score.render" {...props} />
}
