/**
 * Error Logger — Golfers+
 * Logs errors to Supabase `error_logs` table + Sentry for production monitoring.
 * Never throws — safe to call anywhere without affecting app flow.
 */

import { createBrowserClient } from '@supabase/ssr'
import * as Sentry from '@sentry/nextjs'

type ErrorLevel = 'info' | 'warn' | 'error' | 'fatal'

export async function logError(
  context: string,
  error: unknown,
  userId?: string,
  level: ErrorLevel = 'error'
): Promise<void> {
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error)

    const stack = error instanceof Error ? error.stack ?? null : null
    const page = typeof window !== 'undefined' ? window.location.pathname : null

    // Console para dev debugging
    console.error(`[${context}]`, error)

    // Sentry para monitoreo externo
    const sentryLevel = level === 'warn' ? 'warning' : level
    if (error instanceof Error) {
      Sentry.captureException(error, { tags: { context }, level: sentryLevel })
    } else {
      Sentry.captureMessage(message, { tags: { context }, level: sentryLevel })
    }

    // Supabase para monitoreo interno (accesible por Claude)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    await supabase.from('error_logs').insert({
      level,
      message,
      source: context,
      page,
      user_id: userId ?? null,
      metadata: stack ? { stack } : {},
    })
  } catch {
    // Logging nunca debe romper la app
    console.error('[logError] Failed to log error:', error)
  }
}
