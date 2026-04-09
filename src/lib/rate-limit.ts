/**
 * Rate limiter en memoria para API routes de Golfers+
 *
 * Usa un Map en memoria con sliding window. Se resetea en cada cold start
 * de Vercel (aceptable para el volumen actual <100 usuarios).
 * Para 10K+ usuarios, migrar a Vercel KV o Upstash Redis.
 */

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

interface RateLimitResult {
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

/**
 * Headers estándar de rate limiting para incluir en la respuesta
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
  }
}
