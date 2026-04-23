/**
 * Logger estructurado para Golfers+.
 *
 * Uso:
 *   import { logger } from '@/lib/logger'
 *   logger.info('ronda creada', { rondaId, userId })
 *   logger.warn('supabase slow', { duration_ms })
 *   logger.error('scoring falló', error, { rondaId, holeNumber })
 *
 * Comportamiento:
 * - En desarrollo: console.log/warn/error con prefijo y contexto estructurado
 * - En producción:
 *    - info → Sentry breadcrumb (no envía issue, solo contexto para errores futuros)
 *    - warn → Sentry breadcrumb + captureMessage
 *    - error → Sentry captureException con contexto completo
 *
 * Ver docs/audits/2026-04-23-revision-completa.md (P1-9) para contexto.
 * Migración de console.* a logger es gradual — NO big-bang.
 */

type LogContext = Record<string, unknown>

const isDev = process.env.NODE_ENV !== 'production'

// Lazy import de Sentry — evita error si no está configurado en entorno de test
let sentry: typeof import('@sentry/nextjs') | null = null
async function getSentry() {
  if (sentry) return sentry
  if (isDev) return null
  try {
    sentry = await import('@sentry/nextjs')
    return sentry
  } catch {
    return null
  }
}

/** Info — flujo esperado, útil para debug. No genera alerta. */
function info(message: string, context?: LogContext) {
  if (isDev) {
    console.log(`[INFO] ${message}`, context ?? '')
    return
  }
  void getSentry().then(s => {
    s?.addBreadcrumb({ category: 'info', message, data: context, level: 'info' })
  })
}

/**
 * Warn — algo inesperado pero no rompe el flujo. Se captura para análisis
 * agregado en Sentry (no dispara alerta individual).
 */
function warn(message: string, context?: LogContext) {
  if (isDev) {
    console.warn(`[WARN] ${message}`, context ?? '')
    return
  }
  void getSentry().then(s => {
    s?.addBreadcrumb({ category: 'warn', message, data: context, level: 'warning' })
    s?.captureMessage(message, { level: 'warning', extra: context })
  })
}

/**
 * Error — algo rompió el flujo. Se captura como issue en Sentry con stack
 * y contexto completo. Dispara alertas según reglas configuradas.
 */
function error(message: string, err?: unknown, context?: LogContext) {
  if (isDev) {
    console.error(`[ERROR] ${message}`, err ?? '', context ?? '')
    return
  }
  void getSentry().then(s => {
    if (!s) return
    s.addBreadcrumb({ category: 'error', message, data: context, level: 'error' })
    if (err instanceof Error) {
      s.captureException(err, { extra: { message, ...context } })
    } else {
      s.captureMessage(`${message}${err ? ` — ${String(err)}` : ''}`, {
        level: 'error',
        extra: context,
      })
    }
  })
}

export const logger = { info, warn, error }
