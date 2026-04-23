'use client'

import { ErrorScreen } from '@/components/ui/ErrorScreen'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      onRetry={reset}
      homeHref="/"
      errorCode={error.digest}
    />
  )
}
