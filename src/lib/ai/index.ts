/**
 * AI Gateway — punto de entrada único para TODA llamada a LLM de la app.
 *
 * Uso:
 *   import { callLLM, AllProvidersFailedError } from '@/lib/ai'
 *   const r = await callLLM({ role: 'evaluator', system, messages, maxTokens: 1024 })
 *   // r.text, r.provider, r.model, r.fallbackUsed, r.tokensIn, r.tokensOut, r.latencyMs
 *
 * Reglas:
 *   • Pedí un ROL, no un modelo (sin strings de modelo hardcodeados en la app).
 *   • Ningún call-site debe instanciar `new Anthropic()` / `getGenerativeModel()`
 *     directo: todo pasa por acá (control de tráfico central).
 *
 * Spec: docs/superpowers/specs/2026-05-30-ai-gateway-arquitectura-design.md
 */
export { callLLM, isTransient } from './gateway'
export { resolveChain, currentAiEnv, STATIC_CHAINS } from './registry'
export {
  AllProvidersFailedError,
  type AiEnv,
  type LLMRole,
  type LLMMessage,
  type CallLLMParams,
  type LLMResult,
  type ProviderAdapter,
} from './types'
