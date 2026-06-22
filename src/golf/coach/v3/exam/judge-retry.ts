import { isTransient } from '@/lib/ai'

/**
 * Paciencia del juez para el examen OFFLINE.
 *
 * El gateway (`src/lib/ai`) ya reintenta con backoff corto, tuneado para la
 * latencia de PROD. Pero el examen del coach es offline y caro: cada caso ya
 * gastó tokens de Anthropic en la respuesta del coach ANTES de que el juez
 * (Gemini, rol `evaluator`, proveedor único) la puntúe. Si Gemini devuelve un
 * 503 "high demand" transitorio que dura más que el presupuesto corto del
 * gateway, la corrida entera abortaba y tiraba a la basura todo ese trabajo.
 *
 * Este wrapper le da al juez —y SOLO al juez del examen— una paciencia mucho
 * mayor (backoff largo, varios reintentos) para sobrevivir spikes transitorios
 * sin tocar el comportamiento del gateway en prod. La llamada del juez es
 * idempotente (puntúa el mismo texto), así que reintentar es seguro.
 *
 * Solo reintenta errores TRANSITORIOS (reusa `isTransient` del gateway —
 * un-concepto-una-fuente). El juez no ve el 503 crudo: ve un
 * `AllProvidersFailedError` cuyo error real va en `.cause`, así que clasificamos
 * el error y su causa. Ante un error permanente (key inválida, 401) falla rápido
 * en vez de esperar todo el backoff.
 */

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface JudgeRetryInfo {
  attempt: number
  maxRetries: number
  waitMs: number
  error: unknown
}

/** ¿El error —o su causa envuelta por el gateway— amerita reintento? */
export function isRetryableJudgeError(err: unknown): boolean {
  if (isTransient(err)) return true
  const cause = (err as { cause?: unknown } | null)?.cause
  return cause != null && isTransient(cause)
}

// Logger opcional inyectado por el runner (los libs no logean; el script sí).
let _retryHook: ((info: JudgeRetryInfo) => void) | null = null
export function setJudgeRetryHook(fn: ((info: JudgeRetryInfo) => void) | null): void {
  _retryHook = fn
}

export interface JudgePatienceOptions {
  /** Reintentos tras el primer intento. Default 5 → hasta 6 intentos totales. */
  maxRetries?: number
  /** Base del backoff exponencial en ms. Default 2000 → 2s,4s,8s,16s,32s (~62s total). */
  baseMs?: number
  /** Seam de test: reemplaza el sleep real para no esperar en CI. */
  sleepFn?: (ms: number) => Promise<void>
  /** Notificación por reintento. Si se omite, cae al hook global del runner. */
  onRetry?: (info: JudgeRetryInfo) => void
  /** Predicado de reintento. Default: transitorio (vía gateway `isTransient`, incl. `.cause`). */
  isRetryable?: (err: unknown) => boolean
}

/**
 * Ejecuta `fn` y, ante error transitorio, reintenta con backoff exponencial
 * hasta `maxRetries` veces. Falla rápido ante errores permanentes. Agotados los
 * reintentos, re-lanza el último error.
 */
export async function withJudgePatience<T>(
  fn: () => Promise<T>,
  opts: JudgePatienceOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5
  const baseMs = opts.baseMs ?? 2000
  const sleep = opts.sleepFn ?? realSleep
  const retryable = opts.isRetryable ?? isRetryableJudgeError
  const notify = opts.onRetry ?? ((info: JudgeRetryInfo) => _retryHook?.(info))

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxRetries || !retryable(err)) break
      const waitMs = baseMs * 2 ** attempt
      notify({ attempt, maxRetries, waitMs, error: err })
      await sleep(waitMs)
    }
  }
  throw lastErr
}
