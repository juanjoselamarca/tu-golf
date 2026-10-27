/**
 * upsert-supabase.mjs — Inserta/actualiza chunks en knowledge_chunks de forma
 * idempotente. UNIQUE (source_id, chunk_hash) garantiza que re-runs no dupliquen.
 *
 * Idempotente NO alcanzaba cuando el texto CAMBIA. El hash es
 * sha256(breadcrumb + content), así que editar un chunk produce un hash nuevo:
 * el ON CONFLICT no lo reconoce, inserta una fila más y la vieja queda viva.
 * Re-ingestar el corpus del coach reescrito (27-oct-2026) habría dejado 96
 * chunks en prod, la mitad en voseo argentino, con embeddings casi idénticos
 * compitiendo en el RAG — y `knowledge_sources.chunk_count` (que se escribe con
 * el largo del archivo, no con lo que hay en la tabla) tapando la cuenta.
 * Por eso, después del upsert, se borran los chunks de la fuente que ya no
 * están en el archivo. La fuente manda; la tabla la espeja.
 */

const SUPABASE_BATCH = 200;
// Bien debajo de cualquier `db-max-rows`: PostgREST corta la respuesta en su
// tope sin avisar y `.range()` no lo levanta, así que la paginación es por
// cursor sobre `id` (único) y termina recién con una página vacía. Si el tope
// fuera menor que esto, el único costo son más vueltas, nunca una fila perdida.
const PAGINA = 500;

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
 * @returns {Promise<{ inserted: number, batches: number, borrados: number }>}
 */
export async function upsertChunks(sb, sourceId, blockKey, chunks) {
  // Una lista vacía es "no tengo nada que decir de esta fuente" (el parse no
  // encontró chunks, o es un dry-run a medias), NO "la fuente quedó vacía": si
  // borrara acá, un parse fallido vaciaría una fuente viva en prod.
  if (!chunks.length) return { inserted: 0, batches: 0, borrados: 0 };

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

  const borrados = await borrarChunksQueYaNoExisten(
    sb,
    sourceId,
    new Set(rows.map((r) => r.chunk_hash))
  );

  return { inserted: rows.length, batches, borrados };
}

/**
 * Cuenta las filas que la fuente tiene EN LA TABLA y falla si no son las del
 * archivo. Vive acá, al lado del borrado, porque es la otra mitad del mismo
 * invariante: la fuente manda y la tabla la espeja. Cada ingest la llama
 * después del upsert y antes de marcar `ready` — si la dejara de llamar, un
 * lote del DELETE que falle en silencio no se nota: `search_chunks_hybrid` no
 * filtra por `status`, así que los chunks viejos siguen contestando aunque la
 * fuente quede en `error`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} sourceId
 * @param {number} esperados cuántos chunks tiene el archivo
 * @param {string} etiqueta slug de la fuente, para el mensaje de error
 * @returns {Promise<number>} cuántos hay en la tabla (= esperados)
 */
export async function verificarCuentaDeLaFuente(sb, sourceId, esperados, etiqueta) {
  const { count, error } = await sb
    .from('knowledge_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', sourceId);
  if (error) throw error;
  if (count !== esperados) {
    throw new Error(
      `${etiqueta}: la tabla quedó con ${count} chunks y el archivo tiene ${esperados}`
    );
  }
  return count;
}

/**
 * Borra los chunks de la fuente cuyo hash no está en el archivo recién subido:
 * los que quedaron de una versión anterior del texto.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} sourceId
 * @param {Set<string>} vivos hashes que acaba de escribir el upsert
 * @returns {Promise<number>} cuántos se borraron
 */
async function borrarChunksQueYaNoExisten(sb, sourceId, vivos) {
  const huerfanos = [];
  let cursor = null;

  for (;;) {
    let q = sb
      .from('knowledge_chunks')
      .select('id, chunk_hash')
      .eq('source_id', sourceId)
      .order('id', { ascending: true })
      .limit(PAGINA);
    if (cursor) q = q.gt('id', cursor);

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;

    for (const fila of data) {
      if (!vivos.has(fila.chunk_hash)) huerfanos.push(fila.id);
    }
    cursor = data[data.length - 1].id;
  }

  for (let i = 0; i < huerfanos.length; i += SUPABASE_BATCH) {
    const { error } = await sb
      .from('knowledge_chunks')
      .delete()
      .in('id', huerfanos.slice(i, i + SUPABASE_BATCH));
    if (error) throw error;
  }

  return huerfanos.length;
}
