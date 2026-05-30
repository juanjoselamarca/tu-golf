/**
 * Registro de cadenas de modelos por rol + filtro prod/dev.
 *
 * v1: las cadenas viven ESTÁTICAS acá (fuente primaria). Es deliberado:
 * resolver la cadena vía un DB call con service-role en el hot-path de una
 * ruta de torneo en vivo sería un nuevo punto de falla. La tabla `llm_models`
 * (src/lib/cerebro/llm-models.ts) queda como fuente para la Fase 2, cuando
 * se cachee en memoria con TTL.
 *
 * Formato `provider/model` (compatible con Vercel AI Gateway).
 */
import type { AiEnv, LLMRole } from './types'

/**
 * Cadenas de fallback por rol. Orden = preferencia.
 * Cruzan proveedores (Anthropic → Gemini) para tener red cuando Anthropic
 * se satura o throttlea. Sin esto, un 429/529 de Anthropic = feature caída.
 */
export const STATIC_CHAINS: Record<LLMRole, string[]> = {
  primary_chat: [
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-haiku-4-5',
    'google/gemini-2.5-flash',
  ],
  reasoning: [
    'anthropic/claude-opus-4-7',
    'anthropic/claude-sonnet-4-6',
  ],
  evaluator: [
    'anthropic/claude-haiku-4-5',
    'google/gemini-2.5-flash-lite',
  ],
}

/** Entorno de IA actual. Producción Vercel = 'prod'; todo lo demás = 'dev'. */
export function currentAiEnv(): AiEnv {
  return process.env.VERCEL_ENV === 'production' ? 'prod' : 'dev'
}

function providerOf(modelId: string): string {
  return modelId.split('/')[0]
}

/**
 * Resuelve la cadena `provider/model` para un rol y entorno.
 *
 * En `dev`: se EXCLUYE Anthropic para no quemar el cupo de la llave de
 * producción con corridas de E2E/scripts locales (corrige el error de diseño
 * que disparó el rate-limit). Si el rol tiene alternativa no-Anthropic, dev
 * la usa; si NO la tiene, dev devuelve [] y el caller degrada (acepta no
 * tener IA en dev antes que robarle cupo al golfista).
 */
export function resolveChain(role: LLMRole, aiEnv: AiEnv): string[] {
  const full = STATIC_CHAINS[role] ?? []
  if (aiEnv === 'prod') return full
  const nonAnthropic = full.filter((m) => providerOf(m) !== 'anthropic')
  return nonAnthropic
}
