import { MAX_TOOL_ITERS } from '@/golf/coach/loop-config'

/**
 * Tool-loop PURO del examen del coach (causa H del spec de Fase 0).
 *
 * Espeja la lógica del loop real de producción (`runChatStream` en
 * chat-engine.ts): itera hasta `maxIters`, en cada vuelta llama al LLM con el
 * historial; si el LLM pide una o más tools, las despacha vía `executeTool` y
 * realimenta los `tool_result` al siguiente turno; cuando el LLM cierra
 * (`end_turn`/`max_tokens`) devuelve el texto final y el set de tools usadas.
 *
 * A diferencia del motor real, NO hace streaming SSE, NO toca Supabase, NO
 * persiste sesión ni emite eventos: solo el loop. Eso lo hace testeable offline
 * (LLM mockeado) y reutilizable por el examen mockeado (CI) y el live (nocturno).
 *
 * El `MAX_TOOL_ITERS` se importa de `loop-config` —el MISMO que usa el coach
 * real— para que el examen no pueda divergir del comportamiento de producción.
 */

export interface ExamToolUse {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ExamLLMResult {
  /** 'tool_use' → el LLM pide ejecutar tools; cualquier otro → turno final. */
  stopReason: string
  /** Texto del turno (vacío en turnos de solo-tool). */
  text: string
  /** Tools que el LLM pidió ejecutar este turno (vacío si es turno final). */
  toolUses: ExamToolUse[]
  /** Bloques crudos del mensaje assistant, para realimentar al historial. */
  assistantBlocks: unknown[]
}

/** Abstracción del LLM: recibe system + historial + tools, devuelve la decisión. */
export type ExamLLM = (args: {
  system: string
  messages: ExamMessage[]
  tools: unknown[]
}) => Promise<ExamLLMResult>

export interface ExamMessage {
  role: 'user' | 'assistant'
  content: unknown
}

export interface RunExamTurnParams {
  system: string
  userMessage: string
  tools: unknown[]
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>
  llm: ExamLLM
  /** Default: MAX_TOOL_ITERS (el del coach real). */
  maxIters?: number
}

export interface ExamTurnResult {
  finalText: string
  toolsUsed: string[]
}

export async function runExamTurn(params: RunExamTurnParams): Promise<ExamTurnResult> {
  const { system, userMessage, tools, executeTool, llm } = params
  const maxIters = params.maxIters ?? MAX_TOOL_ITERS

  const messages: ExamMessage[] = [{ role: 'user', content: userMessage }]
  const toolsUsed: string[] = []
  let finalText = ''

  for (let iter = 0; iter < maxIters; iter++) {
    const resp = await llm({ system, messages, tools })

    if (resp.stopReason === 'tool_use' && resp.toolUses.length > 0) {
      // Realimentar el turno assistant (con sus bloques tool_use) + los resultados.
      messages.push({ role: 'assistant', content: resp.assistantBlocks })
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
      for (const tu of resp.toolUses) {
        toolsUsed.push(tu.name)
        const result = await executeTool(tu.name, tu.input)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        })
      }
      messages.push({ role: 'user', content: toolResults })
      // El texto pre-tool (chatter) no es el final; lo descartamos en el examen.
      continue
    }

    // Turno final.
    finalText = resp.text
    break
  }

  return { finalText, toolsUsed }
}
