/**
 * error-tracking.ts — captura centralizada de errores de Golfers+
 *
 * Reemplazo de Sentry (cancelado al expirar trial gratis, 12-may-2026).
 * Vendor-neutral: una sola función `captureError` que enruta a PostHog
 * (cliente, ya integrado) y persiste en `error_logs` (Supabase, nuestra
 * copia de seguridad).
 *
 * Diseño:
 * - Funciona en client y server sin que el caller tenga que distinguir.
 * - Nunca tira excepciones — un fallo del logger nunca puede romper la app.
 * - Si en el futuro cambiamos PostHog por otro vendor, sólo se toca este archivo.
 *
 * Uso:
 *   import { captureError } from '@/lib/error-tracking'
 *   try { ... } catch (err) { captureError(err, 'scoring.save', { rondaId }) }
 */

type ErrorLevel = 'info' | 'warning' | 'error' | 'fatal'

export interface CaptureErrorOptions {
  /** Identificador semántico — qué módulo/operación generó el error.
   * Ejemplos: 'scoring.save', 'auth.refresh', 'taiger.chat.stream'. */
  context: string
  /** Severidad. Default 'error'. */
  level?: ErrorLevel
  /** UUID del usuario si está disponible. */
  userId?: string | null
  /** Metadata adicional (rondaId, codigo, payload, etc.). Se guarda como JSONB. */
  meta?: Record<string, unknown>
}

/**
 * Captura un error y lo enruta a PostHog (cliente) + Supabase error_logs.
 * Versión completa con opciones explícitas.
 */
export async function captureError(
  error: unknown,
  options: CaptureErrorOptions
): Promise<void> {
  try {
    const { context, level = 'error', userId = null, meta = {} } = options
    const isClient = typeof window !== 'undefined'

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : safeStringify(error)
    const stack = error instanceof Error && error.stack ? error.stack : null
    const page = isClient ? window.location.pathname : null

    // Siempre console.error para visibilidad inmediata en dev / Vercel logs.
    // En Vercel logs queda capturado por la observabilidad de Functions.
    console.error(`[${context}]`, error)

    // PostHog: sólo client-side. (Si quisiéramos server-side, añadiríamos
    // posthog-node — por ahora no se justifica.)
    if (isClient && process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
      try {
        const ph = (await import('posthog-js')).default
        const errObj = error instanceof Error ? error : new Error(message)
        ph.captureException(errObj, {
          context,
          level,
          ...meta,
        })
      } catch {
        // PostHog no disponible (ad blocker, network) — ignorar.
      }
    }

    // Supabase: copia de seguridad — datos que nosotros controlamos.
    // - En client usamos el browser client (anon key, RLS aplica).
    // - En server usamos el service role (no depende de cookies ni del request),
    //   importado dinámicamente para no entrar al bundle de cliente.
    if (isClient) {
      try {
        const { createBrowserClient } = await import('@supabase/ssr')
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (url && anon) {
          const supabase = createBrowserClient(url, anon)
          await supabase.from('error_logs').insert({
            level: level === 'warning' ? 'warn' : level,
            message,
            source: context,
            page,
            user_id: userId,
            metadata: { ...meta, ...(stack ? { stack } : {}) },
          })
        }
      } catch {
        // Falla de persistencia nunca propaga.
      }
    } else {
      // Server-side: persistir vía service role. Cierra la observabilidad del
      // backend — antes los errores server solo iban a console.error → Vercel
      // logs (sin histórico consultable ni alertas).
      try {
        const { createAdminClient } = await import('@/lib/supabaseAdmin')
        await createAdminClient().from('error_logs').insert({
          level: level === 'warning' ? 'warn' : level,
          message,
          source: context,
          page: null,
          user_id: userId,
          metadata: { ...meta, ...(stack ? { stack } : {}) },
        })
      } catch {
        // Falla de persistencia nunca propaga.
      }
    }
  } catch {
    // El logger NUNCA debe romper la app.
  }
}

/**
 * Versión simplificada — atajo para callers que sólo quieren contexto.
 * Equivale a `captureError(err, { context })`.
 */
export function logError(error: unknown, context: string): void {
  void captureError(error, { context })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
