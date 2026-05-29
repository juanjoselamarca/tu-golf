/**
 * embed-gemini.mjs — Genera embeddings con Gemini gemini-embedding-001 batched.
 *
 * Provider Gemini (decisión Juanjo 2026-05-29): outputDimensionality=1536 para
 * mantener la columna vector(1536) sin migración. Free tier → costo ~0.
 * Batches de hasta MAX_BATCH vía batchEmbedContents. Retry exponencial 3x.
 */

export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIM = 1536;
// Gemini embeddings free tier. Si se pasa a tier pagado, actualizar.
const COST_PER_1K_TOKENS = 0;
const MAX_BATCH = 100;

/**
 * @param {{ batchEmbedContents: Function }} client — Gemini GenerativeModel
 * @param {string[]} texts
 * @param {{ dim?: number }} [opts]
 * @returns {Promise<{ embeddings: number[][], costUsd: number, tokens: number }>}
 */
export async function embedBatch(client, texts, opts = {}) {
  const dim = opts.dim ?? EMBED_DIM;
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
        const res = await client.batchEmbedContents({
          requests: slice.map((text) => ({
            content: { parts: [{ text }] },
            outputDimensionality: dim,
          })),
        });
        // batchEmbedContents preserva el orden de requests.
        embeddings.push(...res.embeddings.map((e) => e.values));
        // Gemini no devuelve uso de tokens en embeddings; estimamos ~4 chars/token.
        const usedTokens = slice.reduce((acc, t) => acc + Math.ceil(t.length / 4), 0);
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
