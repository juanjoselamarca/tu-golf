// ─── Structured Logger ────────────────────────────────────────────────────────
//
// Logging estructurado con soporte de request ID para trazabilidad.
// En producción, los logs se envían a Sentry/PostHog automaticamente
// via los wrappers de console.error/warn de Sentry.

const isDev = process.env.NODE_ENV === 'development'

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
    if (isDev) console.log(`[${context}]${formatMeta(meta)} ${msg}`, data ?? '')
  },

  error: (context: string, msg: string, error?: unknown, meta?: LogMeta) => {
    console.error(`[${context}]${formatMeta(meta)} ERROR: ${msg}`, error ?? '')
  },

  warn: (context: string, msg: string, data?: unknown, meta?: LogMeta) => {
    console.warn(`[${context}]${formatMeta(meta)} WARN: ${msg}`, data ?? '')
  },

  /** Log de API request — para usar en API routes */
  api: (method: string, path: string, status: number, durationMs: number, meta?: LogMeta) => {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    const line = `${method} ${path} ${status} ${durationMs}ms`
    if (level === 'error') console.error(`[API]${formatMeta(meta)} ${line}`)
    else if (level === 'warn') console.warn(`[API]${formatMeta(meta)} ${line}`)
    else if (isDev) console.log(`[API]${formatMeta(meta)} ${line}`)
  },
}
