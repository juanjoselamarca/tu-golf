/**
 * Configuración del tool-loop del coach, compartida por:
 *  - el motor real en producción (`runChatStream`, chat-engine.ts), y
 *  - el examen de regresión (`runExamTurn`, v3/exam/tool-loop.ts).
 *
 * Vive en su propio módulo (sin dependencias pesadas) para que ambos importen
 * EL MISMO valor y el examen no pueda divergir silenciosamente del coach real.
 */

/** Tope de iteraciones del tool-loop (anti loop-infinito si el LLM siempre pide tool). */
export const MAX_TOOL_ITERS = 5
