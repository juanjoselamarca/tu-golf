// ─── Structured Logger ────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development'

export const logger = {

  info: (context: string, msg: string, data?: unknown) => {
    if (isDev) console.log(`[${context}] ${msg}`, data ?? '')
  },

  error: (context: string, msg: string, error?: unknown) => {
    console.error(`[${context}] ERROR: ${msg}`, error ?? '')
    // In production: integrate Sentry or similar here
  },

  warn: (context: string, msg: string, data?: unknown) => {
    console.warn(`[${context}] WARN: ${msg}`, data ?? '')
  },
}
