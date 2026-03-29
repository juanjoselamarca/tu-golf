import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.5,
  beforeSend(event) {
    // Nunca enviar datos personales a Sentry
    if (event.user) {
      delete event.user.email
      delete event.user.username
      delete event.user.ip_address
    }
    return event
  },
})
