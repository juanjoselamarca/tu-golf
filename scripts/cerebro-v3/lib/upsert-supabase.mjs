/**
 * upsert-supabase.mjs — Inserta/actualiza chunks en knowledge_chunks de forma
 * idempotente. UNIQUE (source_id, chunk_hash) garantiza que re-runs no dupliquen.
 */

const SUPABASE_BATCH = 200;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} sourceId
 * @param {string} blockKey
 * @param {Array<{
 *   breadcrumb: string,
 *   ruleAnchor: string|null,
 *   content: string,
 *   contextualPrefix?: string|null,
 *   contentForEmbed: string,
 *   embedding?: number[],
 *   chunkHash: string,
 *   pageStart?: number|null,
 *   pageEnd?: number|null,
 *   tokenCount: number
 * }>} chunks
 * @returns {Promise<{ inserted: number, batches: number }>}
 */
export async function upsertChunks(sb, sourceId, blockKey, chunks) {
  if (!chunks.length) return { inserted: 0, batches: 0 };

  const rows = chunks.map((c) => ({
    source_id: sourceId,
    block_key: blockKey,
    breadcrumb: c.breadcrumb,
    rule_anchor: c.ruleAnchor ?? null,
    content: c.content,
    contextual_prefix: c.contextualPrefix ?? null,
    content_for_embed: c.contentForEmbed,
    embedding: c.embedding ?? null,
    chunk_hash: c.chunkHash,
    page_start: c.pageStart ?? null,
    page_end: c.pageEnd ?? null,
    token_count: c.tokenCount,
  }));

  let batches = 0;
  for (let i = 0; i < rows.length; i += SUPABASE_BATCH) {
    const slice = rows.slice(i, i + SUPABASE_BATCH);
    const { error } = await sb
      .from('knowledge_chunks')
      .upsert(slice, { onConflict: 'source_id,chunk_hash', ignoreDuplicates: false });
    if (error) throw error;
    batches++;
  }

  return { inserted: rows.length, batches };
}
