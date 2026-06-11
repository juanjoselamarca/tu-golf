import Anthropic from '@anthropic-ai/sdk'
import { coachModel } from '@/golf/coach/model'
import type { ExamLLM } from './tool-loop'

/**
 * Adaptador del SDK de Anthropic al contrato `ExamLLM` del tool-loop del examen.
 * Llama `messages.create` (no-streaming) con EL MISMO modelo (`coachModel()`),
 * system cacheado y tools que usa el coach real, y mapea la respuesta a
 * `{ stopReason, text, toolUses, assistantBlocks }`.
 *
 * Es el único punto del examen que toca la red; se ejercita en el examen LIVE.
 */
export function makeAnthropicExamLLM(anthropic: Anthropic): ExamLLM {
  return async ({ system, messages, tools }) => {
    const resp = await anthropic.messages.create({
      model: coachModel(),
      max_tokens: 2048,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: tools as Anthropic.Tool[],
      messages: messages as Anthropic.MessageParam[],
    })
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const toolUses = resp.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }))
    return {
      stopReason: resp.stop_reason ?? 'end_turn',
      text,
      toolUses,
      assistantBlocks: resp.content,
    }
  }
}
