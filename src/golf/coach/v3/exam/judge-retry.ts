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
 */

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface JudgePatienceOptions {
  /** Reintentos tras el primer intento. Default 5 → hasta 6 intentos totales. */
  maxRetries?: number
  /** Base del backoff exponencial en ms. Default 2000 → 2s,4s,8s,16s,32s (~62s total). */
  baseMs?: number
  /** Seam de test: reemplaza el sleep real para no esperar en CI. */
  sleepFn?: (ms: number) => Promise<void>
  /** Notificación opcional por reintento (los libs no logean; el runner sí puede). */
  onRetry?: (info: { attempt: number; maxRetries: number; waitMs: number; error: unknown }) => void
}

/**
 * Ejecuta `fn` y, ante cualquier error, reintenta con backoff exponencial hasta
 * `maxRetries` veces. Si se agotan, re-lanza el último error.
 */
export async function withJudgePatience<T>(
  fn: () => Promise<T>,
  opts: JudgePatienceOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5
  const baseMs = opts.baseMs ?? 2000
  const sleep = opts.sleepFn ?? realSleep

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxRetries) break
      const waitMs = baseMs * 2 ** attempt
      opts.onRetry?.({ attempt, maxRetries, waitMs, error: err })
      await sleep(waitMs)
    }
  }
  throw lastErr
}
