// Barrel del módulo prompts del coach v2 (cerebro v2 vivo en prod).
// Ola 0 Task 10: extracción de prompts.ts a submódulos preservando contenido.
// El snapshot test en prompts/__tests__/snapshot.test.ts valida que el contenido
// (tras normalización de whitespace por Vitest) es idéntico al monolito previo.

import { IDENTIDAD } from './identidad'
import { ANTI_HALLUCINATION } from './anti_hallucination'
import { ARITMETICA } from './aritmetica'
import { PLANTILLAS } from './plantillas'
import { PLAYER_CONTEXT_PLACEHOLDER } from './contexto'

// Recompone TAIGER_SYSTEM_PROMPT. ARITMETICA se inserta junto a las reglas
// críticas (tras anti-hallucination) para que el guardrail de números aplique
// antes de los frameworks que generan desgloses de score.
export const TAIGER_SYSTEM_PROMPT = [
  IDENTIDAD,
  ANTI_HALLUCINATION,
  ARITMETICA,
  PLANTILLAS,
  PLAYER_CONTEXT_PLACEHOLDER,
].join('\n\n')

export { IDENTIDAD } from './identidad'
export { ANTI_HALLUCINATION } from './anti_hallucination'
export { ARITMETICA } from './aritmetica'
export { PLANTILLAS, TAIGER_SESSION_STARTER } from './plantillas'
export { PLAYER_CONTEXT_PLACEHOLDER, buildContextString, type TaigerContext } from './contexto'
