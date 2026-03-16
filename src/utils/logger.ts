// ─── Structured Logger ────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (context: string, msg: string, data?: any) => {
    if (isDev) console.log(`[${context}] ${msg}`, data ?? '')
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (context: string, msg: string, error?: any) => {
    console.error(`[${context}] ERROR: ${msg}`, error ?? '')
    // In production: integrate Sentry or similar here
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (context: string, msg: string, data?: any) => {
    console.warn(`[${context}] WARN: ${msg}`, data ?? '')
  },
}
