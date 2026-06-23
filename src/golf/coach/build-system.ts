/**
 * Fuente ÚNICA de verdad del armado del system prompt + tool set del coach.
 *
 * Antes esto vivía duplicado en `src/app/api/taiger/chat/route.ts` (producción) y
 * en `src/golf/coach/v3/exam/build-exam-system.ts` (examen). Las dos copias ya
 * divergieron una vez (11-jun: "System Prompt Divergence Fixed"). Con un builder
 * compartido + test de paridad, el examen mide EXACTAMENTE el prompt/tools que ve
 * el coach real — el gate no puede medir un coach distinto al que se shippea.
 *
 * Funciones PURAS: reciben `cerebroV3Enabled` y `onboarded` ya resueltos (el route
 * los lee de la DB; el examen los siembra). Así son testeables sin Supabase.
 *
 * Spec: docs/superpowers/specs/2026-06-22-examen-v3-fidelidad-design.md (D1).
 */
import { TAIGER_SYSTEM_PROMPT, TAIGER_SESSION_STARTER } from './prompts'
import { TOOLS_INSTRUCTION } from './prompts/tools-instruction'
import { TAIGER_TOOLS } from './tools'
import { ENGAGEMENT_SECTION, CONOCER_SECTION, RAG_SECTION } from './v3/prompts'
import { ONBOARDING_SECTION } from './v3/onboarding'
import { SEARCH_KNOWLEDGE_TOOL } from './v3/tools/search-knowledge-chunks-tool'
import { FOCUS_TOOLS } from './v3/tools/focus-tools'
import { FIELD_CONTEXT_TOOL } from './v3/tools/field-context-tool'

export interface BuildCoachSystemParams {
  /** El contexto del jugador ya armado (reemplaza el placeholder {PLAYER_CONTEXT}). */
  contextString: string
  /** Flag cerebro v3 por usuario (DB en prod / sembrado en el examen). */
  cerebroV3Enabled: boolean
  /** ¿El jugador ya está onboarded? Solo relevante con el flag ON. */
  onboarded: boolean
}

/**
 * Arma el system prompt final, idéntico a producción. Con el flag ON appendea, en
 * este orden: ENGAGEMENT → CONOCER → (ONBOARDING si !onboarded) → RAG.
 */
export function buildCoachSystem({
  contextString,
  cerebroV3Enabled,
  onboarded,
}: BuildCoachSystemParams): string {
  const systemWithContext = TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', contextString)
  const onboardingSection = cerebroV3Enabled && !onboarded ? `\n\n${ONBOARDING_SECTION}` : ''
  const ragSection = cerebroV3Enabled
    ? `\n\n${ENGAGEMENT_SECTION}\n\n${CONOCER_SECTION}${onboardingSection}\n\n${RAG_SECTION}`
    : ''
  return `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${TAIGER_SESSION_STARTER}${TOOLS_INSTRUCTION}${ragSection}`
}

/** El set de tools expuesto al modelo. Con el flag ON suma las 7 tools v3. */
export function buildCoachTools({ cerebroV3Enabled }: { cerebroV3Enabled: boolean }) {
  return cerebroV3Enabled
    ? [...TAIGER_TOOLS, SEARCH_KNOWLEDGE_TOOL, ...FOCUS_TOOLS, FIELD_CONTEXT_TOOL]
    : TAIGER_TOOLS
}
