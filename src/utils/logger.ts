// ─── Structured Logger ────────────────────────────────────────────────────────
//
// Logging estructurado con soporte de request ID + userId para trazabilidad.
// En desarrollo: console.* con prefijos.
// En producción:
//   - logger.info / logger.warn: console.* (Vercel logs los captura para server,
//     PostHog autocapture los ve en client).
//   - logger.error: console.error + captureError (PostHog + Supabase error_logs).
//
// Ver docs/audits/2026-04-23-revision-completa.md (P1-9) para contexto.

import { captureError } from '@/lib/error-tracking'

const isDev = process.env.NODE_ENV !== 'production'

interface LogMeta {
  requestId?: string
  userId?: string
  [key: string]: unknown
}

function formatMeta(meta?: LogMeta): string {
  if (!meta) return ''
  const parts: string[] = []
  if (meta.requestId) parts.push(`req=${meta.requestId.slice(0, 8)}`)
  if (meta.userId) parts.push(`user=${meta.userId.slice(0, 8)}`)
  return parts.length > 0 ? ` (${parts.join(' ')})` : ''
}

export const logger = {
  info: (context: string, msg: string, data?: unknown, meta?: LogMeta) => {
    const line = `[${context}]${formatMeta(meta)} ${msg}`
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(line, data ?? '')
      return
    }
    // eslint-disable-next-line no-console
    console.log(line, data ?? '')
  },

  warn: (context: string, msg: string, data?: unknown, meta?: LogMeta) => {
    const line = `[${context}]${formatMeta(meta)} WARN: ${msg}`
    // eslint-disable-next-line no-console
    console.warn(line, data ?? '')
  },

  error: (context: string, msg: string, error?: unknown, meta?: LogMeta) => {
    const line = `[${context}]${formatMeta(meta)} ERROR: ${msg}`
    // eslint-disable-next-line no-console
    console.error(line, error ?? '')
    if (isDev) return
    void captureError(error ?? new Error(msg), {
      context,
      level: 'error',
      userId: meta?.userId ?? null,
      meta: { message: msg, ...meta },
    })
  },

  /** Log de API request — para usar en API routes. Sólo registra como error
   * en error_logs si status >= 500. */
  api: (method: string, path: string, status: number, durationMs: number, meta?: LogMeta) => {
    const line = `${method} ${path} ${status} ${durationMs}ms`
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error(`[API]${formatMeta(meta)} ${line}`)
      if (!isDev) {
        void captureError(new Error(line), {
          context: 'api',
          level: 'error',
          userId: meta?.userId ?? null,
          meta: { ...meta, method, path, status, durationMs },
        })
      }
    } else if (status >= 400) {
      // eslint-disable-next-line no-console
      console.warn(`[API]${formatMeta(meta)} ${line}`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`[API]${formatMeta(meta)} ${line}`)
    }
  },
}
