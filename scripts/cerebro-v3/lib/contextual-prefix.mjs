/**
 * contextual-prefix.mjs — Genera prefijos contextuales con Haiku 4.5.
 * Técnica: Anthropic Contextual Retrieval (2024). Mejora accuracy de RAG ~35%
 * al prepender al chunk una oración que lo sitúa dentro del documento padre.
 *
 * Failure mode: si Haiku falla, devuelve prefix vacío y costo 0 (degradación
 * graceful). El chunk se embed sin prefix.
 */

const HAIKU_INPUT_COST_PER_M = 0.8; // USD per 1M input tokens
const HAIKU_OUTPUT_COST_PER_M = 4.0; // USD per 1M output tokens

const SYSTEM_PROMPT =
  'You generate a one-sentence contextual prefix that situates a document chunk within its parent document. The prefix is prepended to the chunk before embedding to improve retrieval accuracy. Output ONLY the prefix sentence, max 50 tokens, no preamble, no quotes.';

/**
 * @param {{ messages: { create: Function } }} client — Anthropic client
 * @param {{ docTitle: string, breadcrumb: string, content: string }} chunk
 * @returns {Promise<{ prefix: string, costUsd: number, error: Error|null }>}
 */
export async function generateContextualPrefix(client, { docTitle, breadcrumb, content }) {
  const userMsg = `Document: ${docTitle}\nSection breadcrumb: ${breadcrumb}\nChunk content: ${content.slice(0, 2000)}`;
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });
    const prefix = res.content?.[0]?.text?.trim() ?? '';
    const costUsd =
      ((res.usage?.input_tokens ?? 0) / 1_000_000) * HAIKU_INPUT_COST_PER_M +
      ((res.usage?.output_tokens ?? 0) / 1_000_000) * HAIKU_OUTPUT_COST_PER_M;
    return { prefix, costUsd, error: null };
  } catch (error) {
    return { prefix: '', costUsd: 0, error };
  }
}
