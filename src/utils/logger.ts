// ─── Structured Logger ────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development'

export const logger = {

  info: (context: string, msg: string, data?: any) => {
    if (isDev) console.log(`[${context}] ${msg}`, data ?? '')
  },

  error: (context: string, msg: string, error?: any) => {
    console.error(`[${context}] ERROR: ${msg}`, error ?? '')
    // In production: integrate Sentry or similar here
  },

  warn: (context: string, msg: string, data?: any) => {
    console.warn(`[${context}] WARN: ${msg}`, data ?? '')
  },
}
