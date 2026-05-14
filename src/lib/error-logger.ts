/**
 * Error Logger — Golfers+
 *
 * Wrapper legacy. La implementación real vive en `@/lib/error-tracking`.
 * Se mantiene `logError(context, error, userId?, level?)` por compatibilidad
 * con callers existentes — pero internamente delega a `captureError`.
 *
 * Para código nuevo, importar `captureError` directamente.
 */
import { captureError } from './error-tracking'

type ErrorLevel = 'info' | 'warn' | 'error' | 'fatal'

export async function logError(
  context: string,
  error: unknown,
  userId?: string,
  level: ErrorLevel = 'error'
): Promise<void> {
  await captureError(error, {
    context,
    level: level === 'warn' ? 'warning' : level,
    userId: userId ?? null,
  })
}
