import { searchKnowledgeChunks } from '@/golf/coach/v3/retrieval'
import type { Jurisdiction } from '@/golf/coach/v3/retrieval/types'
import { captureError } from '@/lib/error-tracking'

/**
 * Dispatch del tool_use `search_knowledge_chunks` (cerebro v3, RAG de reglas
 * oficiales). Delega en el motor de retrieval y devuelve un bloque tool_result
 * listo para el loop de Anthropic. Nunca lanza por fallo de retrieval: devuelve
 * chunks vacíos + flag de error para que el coach use el disclaimer
 * anti-hallucination en vez de cortar el stream (spec §8 manejo de errores).
 *
 * Vive fuera de route.ts porque Next App Router prohíbe exports que no sean
 * handlers HTTP en archivos `route.ts`. El resto de las tools v2 siguen por
 * `executeTool` (src/golf/coach/tools.ts).
 */
export async function handleToolUse(
  block: {
    tool_use_id: string
    name: string
    input: { query?: string; jurisdictions?: Jurisdiction[] }
  },
  ctx: { userId?: string },
): Promise<{ type: 'tool_result'; tool_use_id: string; content: string }> {
  if (block.name !== 'search_knowledge_chunks') {
    throw new Error(`handleToolUse: tool no soportada "${block.name}"`)
  }
  try {
    const chunks = await searchKnowledgeChunks(String(block.input.query ?? ''), {
      jurisdictions: block.input.jurisdictions,
      userId: ctx.userId,
      topK: 5,
    })
    return { type: 'tool_result', tool_use_id: block.tool_use_id, content: JSON.stringify({ chunks }) }
  } catch (e) {
    void captureError(e, { context: 'taiger.chat.search_knowledge', userId: ctx.userId ?? null })
    return {
      type: 'tool_result',
      tool_use_id: block.tool_use_id,
      content: JSON.stringify({ chunks: [], error: 'search_failed' }),
    }
  }
}
