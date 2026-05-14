// Next.js instrumentation entry point.
// Si en el futuro agregamos OpenTelemetry, APM, o un error tracker
// server-side, su init va aquí.
// Por ahora: vacío. Captura de errores client-side vive en
// src/lib/error-tracking.ts (PostHog + Supabase error_logs).
export async function register(): Promise<void> {
  // intentionally empty
}
