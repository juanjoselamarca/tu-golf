/**
 * Error Logger — Golfers+
 * Logs errors to Supabase `error_log` table for production monitoring.
 *
 * SQL para crear la tabla:
 * ---------------------------------------------------------
 * CREATE TABLE IF NOT EXISTS error_log (
 *   id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   created_at timestamptz DEFAULT now(),
 *   context    text NOT NULL,
 *   message    text,
 *   stack      text,
 *   user_id    text,
 *   route      text
 * );
 *
 * -- Índice para búsquedas por fecha
 * CREATE INDEX idx_error_log_created_at ON error_log (created_at DESC);
 * ---------------------------------------------------------
 */

import { createBrowserClient } from '@supabase/ssr'

/**
 * Logs an error to Supabase and console.
 * Never throws — safe to call anywhere without affecting app flow.
 */
export async function logError(
  context: string,
  error: unknown,
  userId?: string
): Promise<void> {
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error)

    const stack = error instanceof Error ? error.stack ?? null : null

    // Detect current route (browser only)
    const route =
      typeof window !== 'undefined' ? window.location.pathname : null

    // Always log to console for dev debugging
    console.error(`[${context}]`, error)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    await supabase.from('error_log').insert({
      context,
      message,
      stack,
      user_id: userId ?? null,
      route,
    })
  } catch {
    // Silently swallow — logging should never break the app
    console.error('[logError] Failed to log error:', error)
  }
}
