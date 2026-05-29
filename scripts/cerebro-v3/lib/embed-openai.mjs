/**
 * embed-openai.mjs — Genera embeddings con text-embedding-3-small batched.
 * Splittea automáticamente batches > 100 (límite OpenAI).
 * Retry exponencial 3x ante errores transitorios.
 */

const COST_PER_1K_TOKENS = 0.00002;
const MAX_BATCH = 100;

/**
 * @param {{ embeddings: { create: Function } }} client — OpenAI client
 * @param {string[]} texts
 * @param {{ model?: string }} [opts]
 * @returns {Promise<{ embeddings: number[][], costUsd: number, tokens: number }>}
 */
export async function embedBatch(client, texts, opts = {}) {
  const model = opts.model ?? 'text-embedding-3-small';
  const embeddings = [];
  let totalCost = 0;
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const slice = texts.slice(i, i + MAX_BATCH);
    let attempt = 0;
    let lastErr;
    let success = false;

    while (attempt < 3 && !success) {
      try {
        const res = await client.embeddings.create({ model, input: slice });
        // OpenAI puede devolver data sin order garantizado — re-ordenar por index
        const sorted = [...res.data].sort((a, b) => a.index - b.index);
        embeddings.push(...sorted.map((d) => d.embedding));
        const usedTokens = res.usage?.total_tokens ?? 0;
        totalTokens += usedTokens;
        totalCost += (usedTokens / 1000) * COST_PER_1K_TOKENS;
        success = true;
      } catch (e) {
        lastErr = e;
        attempt++;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    if (!success) {
      throw new Error(`embedBatch failed after 3 attempts at batch index ${i}: ${lastErr?.message}`);
    }
  }

  return { embeddings, costUsd: totalCost, tokens: totalTokens };
}
