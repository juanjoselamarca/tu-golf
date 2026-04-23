// ─── Structured Logger ────────────────────────────────────────────────────────
//
// Logging estructurado con soporte de request ID + userId para trazabilidad.
// En desarrollo: console.* con prefijos.
// En producción: Sentry breadcrumbs + captureException para errors.
//
// Uso:
//   logger.info('auth', 'login OK', { userId }, { requestId })
//   logger.error('scoring', 'upsert falló', err, { rondaId })
//
// Ver docs/audits/2026-04-23-revision-completa.md (P1-9) para contexto.

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

// Lazy Sentry import: evita error en test environment donde no está configurado
type SentryModule = typeof import('@sentry/nextjs')
let sentryCache: SentryModule | null = null
async function getSentry(): Promise<SentryModule | null> {
  if (sentryCache) return sentryCache
  if (isDev) return null
  try {
    sentryCache = await import('@sentry/nextjs')
    return sentryCache
  } catch {
    return null
  }
}

function sendBreadcrumb(level: 'info' | 'warning' | 'error', category: string, message: string, data?: unknown) {
  if (isDev) return
  void getSentry().then(s => {
    s?.addBreadcrumb({ category, message, level, data: data as Record<string, unknown> | undefined })
  })
}

export const logger = {
  info: (context: string, msg: string, data?: unknown, meta?: LogMeta) => {
    const line = `[${context}]${formatMeta(meta)} ${msg}`
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(line, data ?? '')
      return
    }
    sendBreadcrumb('info', context, msg, { ...meta, data })
  },

  warn: (context: string, msg: string, data?: unknown, meta?: LogMeta) => {
    const line = `[${context}]${formatMeta(meta)} WARN: ${msg}`
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(line, data ?? '')
      return
    }
    sendBreadcrumb('warning', context, msg, { ...meta, data })
    void getSentry().then(s => {
      s?.captureMessage(msg, { level: 'warning', extra: { context, ...meta, data } })
    })
  },

  error: (context: string, msg: string, error?: unknown, meta?: LogMeta) => {
    const line = `[${context}]${formatMeta(meta)} ERROR: ${msg}`
    if (isDev) {
      // eslint-disable-next-line no-console
      console.error(line, error ?? '')
      return
    }
    sendBreadcrumb('error', context, msg, { ...meta })
    void getSentry().then(s => {
      if (!s) return
      if (error instanceof Error) {
        s.captureException(error, { extra: { context, message: msg, ...meta } })
      } else {
        s.captureMessage(`${context}: ${msg}${error ? ` — ${String(error)}` : ''}`, {
          level: 'error',
          extra: { context, ...meta },
        })
      }
    })
  },

  /** Log de API request — para usar en API routes */
  api: (method: string, path: string, status: number, durationMs: number, meta?: LogMeta) => {
    const level: 'info' | 'warning' | 'error' =
      status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info'
    const line = `${method} ${path} ${status} ${durationMs}ms`
    if (isDev) {
      if (level === 'error') {
        // eslint-disable-next-line no-console
        console.error(`[API]${formatMeta(meta)} ${line}`)
      } else if (level === 'warning') {
        // eslint-disable-next-line no-console
        console.warn(`[API]${formatMeta(meta)} ${line}`)
      } else {
        // eslint-disable-next-line no-console
        console.log(`[API]${formatMeta(meta)} ${line}`)
      }
      return
    }
    sendBreadcrumb(level, 'api', line, { ...meta, method, path, status, durationMs })
    if (level === 'error') {
      void getSentry().then(s => {
        s?.captureMessage(line, { level: 'error', extra: { ...meta, method, path, status, durationMs } })
      })
    }
  },
}
