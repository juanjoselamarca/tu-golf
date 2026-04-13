import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,

  // Filtrar eventos ruidosos que no son bugs reales
  beforeSend(event) {
    const msg = event.exception?.values?.[0]?.value ?? ''
    // Auth errors normales (usuario no logueado, sesión expirada)
    if (msg.includes('JWT') || msg.includes('Auth session missing')) return null
    // Supabase schema cache — se resuelve solo
    if (msg.includes('schema cache')) return null
    return event
  },

  // Tags globales para filtrado en dashboard
  initialScope: {
    tags: {
      app: 'golfers-plus',
      version: process.env.npm_package_version ?? 'unknown',
    },
  },
})
