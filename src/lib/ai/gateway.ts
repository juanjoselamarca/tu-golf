/**
 * Motor de ejecución del AI Gateway: recorre la cadena de proveedores con
 * retry+backoff y fallback automático. Esto es lo que hoy NO existe —
 * `resolveFallbackChain` devolvía strings y nada los ejecutaba.
 *
 * FORESIGHT (mismo principio que el reranker del coach):
 *   • Timeout duro por intento — nunca cuelga una request en un torneo.
 *   • Error transitorio (429/529/5xx/timeout/red) → reintenta con backoff;
 *     agotados los reintentos → salta al siguiente proveedor de la cadena.
 *   • Error NO transitorio (400/401/422) → no reintenta ese proveedor, salta.
 *   • Cadena entera agotada → AllProvidersFailedError (la ruta degrada).
 */
import { anthropicAdapter } from './providers/anthropic'
import { geminiAdapter } from './providers/gemini'
import { resolveChain, currentAiEnv } from './registry'
import {
  AllProvidersFailedError,
  type CallLLMParams,
  type LLMResult,
  type ProviderAdapter,
  type ProviderGenerateArgs,
} from './types'

// 1 reintento por proveedor (2 intentos). El valor de resiliencia real es el
// fallback CROSS-proveedor (→ Gemini), no martillar al mismo proveedor saturado.
// Mantiene acotada la latencia en una ruta en vivo de torneo.
const MAX_RETRIES = 1
let _backoffBaseMs = 400
const DEFAULT_TIMEOUT_MS = 30_000

/** Test seam: neutraliza el backoff para que los tests no esperen en real. */
export function _setBackoffBaseForTests(ms: number): void {
  _backoffBaseMs = ms
}
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_TEMPERATURE = 0

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529])

const ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  google: geminiAdapter,
  gemini: geminiAdapter,
}

/** ¿El error amerita reintento/fallback? (rate-limit, overload, red, timeout). */
export function isTransient(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; message?: string } | null
  const status = e?.status ?? e?.statusCode
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status)
  const msg = String(e?.message ?? '').toLowerCase()
  return /timeout|overloaded|rate.?limit|too many|econnreset|etimedout|fetch failed|network|socket hang|aborted/.test(
    msg,
  )
}

function backoffMs(attempt: number): number {
  // Exponencial con jitter determinístico (sin Math.random para tests estables
  // en CI; el jitter real no aporta a fairness con 1 cliente).
  return _backoffBaseMs * 2 ** attempt
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('gateway: timeout')), ms)),
  ])
}

/**
 * Llamada única a LLM. Pedí un ROL, no un modelo. El gateway elige el modelo,
 * reintenta y cae a otro proveedor solo si hace falta.
 *
 * @throws AllProvidersFailedError si toda la cadena falla.
 */
export async function callLLM(params: CallLLMParams): Promise<LLMResult> {
  const aiEnv = params.aiEnv ?? currentAiEnv()
  const chain = params.chain ?? resolveChain(params.role, aiEnv)
  if (chain.length === 0) {
    throw new AllProvidersFailedError(
      `Sin proveedores para rol=${params.role} en env=${aiEnv}`,
    )
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const args: Omit<ProviderGenerateArgs, 'model'> = {
    system: params.system,
    messages: params.messages,
    maxTokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: params.temperature ?? DEFAULT_TEMPERATURE,
    responseJson: params.responseJson ?? false,
  }

  const t0 = Date.now()
  let attempts = 0
  let lastErr: unknown

  for (let ci = 0; ci < chain.length; ci++) {
    const slash = chain[ci].indexOf('/')
    const providerKey = chain[ci].slice(0, slash)
    const model = chain[ci].slice(slash + 1)
    const adapter = ADAPTERS[providerKey]
    if (!adapter) {
      lastErr = new Error(`gateway: proveedor desconocido '${providerKey}'`)
      continue
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      attempts++
      try {
        const out = await withTimeout(adapter.generate({ ...args, model }), timeoutMs)
        return {
          text: out.text,
          provider: providerKey,
          model,
          fallbackUsed: ci > 0,
          attempts,
          tokensIn: out.tokensIn,
          tokensOut: out.tokensOut,
          latencyMs: Date.now() - t0,
        }
      } catch (err) {
        lastErr = err
        if (!isTransient(err)) break // no reintentar este proveedor; saltar al siguiente
        if (attempt < MAX_RETRIES) await sleep(backoffMs(attempt))
      }
    }
  }

  throw new AllProvidersFailedError(
    `gateway: toda la cadena falló para rol=${params.role}`,
    lastErr,
  )
}
