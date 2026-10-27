/**
 * Rate limiter para API routes de Golfers+
 *
 * `checkRateLimit`: Map en memoria, ventana fija. Se resetea en cada instancia
 * de Vercel: sirve para frenar ráfagas (sin costo de red en rutas calientes).
 *
 * `checkRateLimitPersistente`: misma semántica y mismo resultado, contado en la
 * base (rate_limit_hits vía la RPC atómica rate_limit_hit). Vale entre
 * instancias: usarlo donde el freno es de seguridad (intentos de clave) o de
 * carga contra un tercero (fedegolf.cl), no en cada request.
 */
import { createAdminClient } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Limpiar entradas expiradas cada 5 minutos
setInterval(() => {
  const now = Date.now()
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key)
  })
}, 5 * 60 * 1000)

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Verifica si un request está dentro del límite
 * @param key - Identificador único (ej: `screenshot:${userId}`, `admin:${userId}`)
 * @param max - Máximo de requests permitidos en la ventana
 * @param windowMs - Ventana de tiempo en milisegundos
 */
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs }
  }

  entry.count++
  const allowed = entry.count <= max
  return { allowed, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt }
}

/** Fila de rate_limit_hit() (supabase/migrations/20261019200000_fedegolf_1b_avisos_y_rate_limit.sql). */
export interface FilaRateLimit {
  permitido: boolean
  restantes: number
  reinicia_en: string
}

export type RpcRateLimit = (key: string, max: number, windowMs: number) => Promise<FilaRateLimit>

const rpcRateLimit: RpcRateLimit = async (key, max, windowMs) => {
  const { data, error } = await createAdminClient()
    .rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_ms: windowMs })
  if (error) throw error
  const fila = (Array.isArray(data) ? data[0] : data) as FilaRateLimit | undefined
  if (!fila) throw new Error('rate_limit_hit no devolvió fila')
  return fila
}

/**
 * Como `checkRateLimit`, pero contado en la base: el límite se respeta aunque
 * cada request caiga en otra instancia. Si la base no responde, cae al
 * limitador en memoria: nunca queda sin freno ni bloquea a todos por una caída.
 */
export async function checkRateLimitPersistente(
  key: string,
  max: number,
  windowMs: number,
  rpc: RpcRateLimit = rpcRateLimit,
): Promise<RateLimitResult> {
  try {
    const fila = await rpc(key, max, windowMs)
    return { allowed: fila.permitido, remaining: fila.restantes, resetAt: new Date(fila.reinicia_en).getTime() }
  } catch (err) {
    // Solo el prefijo: el resto de la clave es un id de usuario.
    await captureError(err, { context: 'rate-limit/persistente', level: 'warning', meta: { clave: key.split(':')[0] } })
    return checkRateLimit(key, max, windowMs)
  }
}

/**
 * IP del cliente detrás del proxy de Vercel (primer valor de x-forwarded-for).
 * Fuente única para las claves de rate limit por IP.
 */
export function clientIpFrom(request: { headers: { get(name: string): string | null } }): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/**
 * Headers estándar de rate limiting para incluir en la respuesta
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
  }
}
