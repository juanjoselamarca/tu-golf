/**
 * Tipos compartidos del AI Gateway (src/lib/ai).
 *
 * Todo el código de la app llama a la IA vía `callLLM` pidiendo un ROL
 * (no un modelo). El gateway resuelve la cadena de modelos, ejecuta con
 * retry+fallback multi-proveedor, y devuelve una forma común.
 *
 * Spec: docs/superpowers/specs/2026-05-30-ai-gateway-arquitectura-design.md
 */

/** Entorno de IA. En `dev` el gateway evita la llave Anthropic de producción. */
export type AiEnv = 'prod' | 'dev'

/**
 * Roles de generación de texto. Mapean a `llm_models.role`.
 * (embedding/rerank tienen su propio camino en src/golf/coach/v3/retrieval).
 */
export type LLMRole = 'primary_chat' | 'reasoning' | 'evaluator'

/**
 * Superficie de negocio que originó la llamada — el corte que responde
 * "¿cuánto cuesta cada feature?". Independiente de `role` (que es ruteo técnico).
 * `eval` = scripts de banco de pruebas/smoke (excluidos del costo de prod).
 */
export type AiSurface =
  | 'coach_chat'
  | 'import_vision'
  | 'import_insight'
  | 'rag_search'
  | 'tournament_assistant'
  | 'eval'
  | 'other'

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CallLLMParams {
  role: LLMRole
  system?: string
  messages: LLMMessage[]
  maxTokens?: number
  temperature?: number
  /** Pista al proveedor para que devuelva JSON puro (Gemini responseMimeType). */
  responseJson?: boolean
  /** Timeout duro por intento (ms). Default por rol en gateway. */
  timeoutMs?: number
  /** Override de entorno (default: derivado de VERCEL_ENV). */
  aiEnv?: AiEnv
  /** Override de cadena `provider/model` (tests / casos especiales). */
  chain?: string[]
  /** Usuario que originó la llamada (para unit-economics). null = sistema/cron/script. */
  userId?: string | null
  /** Superficie de negocio (coach/import/torneos/…). Se loguea en ai_usage.surface. */
  surface?: AiSurface
}

export interface LLMResult {
  text: string
  /** 'anthropic' | 'google' */
  provider: string
  /** model id sin prefijo de proveedor, ej. 'claude-haiku-4-5' */
  model: string
  /** true si se usó un proveedor de fallback (no el primero de la cadena). */
  fallbackUsed: boolean
  /** intentos totales realizados (incluye reintentos y saltos de proveedor). */
  attempts: number
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

/** Argumentos normalizados que recibe un adaptador de proveedor. */
export interface ProviderGenerateArgs {
  /** model id sin prefijo (ej. 'claude-haiku-4-5', 'gemini-2.5-flash-lite'). */
  model: string
  system?: string
  messages: LLMMessage[]
  maxTokens: number
  temperature: number
  responseJson: boolean
  signal?: AbortSignal
}

export interface ProviderResult {
  text: string
  tokensIn: number
  tokensOut: number
}

/** Contrato común de un proveedor (Anthropic, Gemini, …). Mockeable en tests. */
export interface ProviderAdapter {
  generate(args: ProviderGenerateArgs): Promise<ProviderResult>
}

/** Se lanza cuando TODA la cadena de proveedores falló. La capa de ruta degrada. */
export class AllProvidersFailedError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'AllProvidersFailedError'
    this.cause = cause
  }
}
