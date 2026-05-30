-- 20260528_ola1e_search_chunks_hybrid.sql
--
-- Sub-Ola 1e del cerebro v3: función SQL para hybrid search vector+BM25.
--
-- Args:
--   query_embedding: vector(1536) del query embeddado con text-embedding-3-small
--   query_text:      string crudo del query (para FTS BM25)
--   alpha:           peso del score vectorial (1-alpha = peso BM25). Default 0.7.
--   top_k:           cuántos chunks devolver. Default 20.
--   jurisdictions:   filtro opcional por jurisdicciones (array). NULL = todas.
--   block_filter:    filtro opcional por block_key. NULL = todos.
--
-- Returns: tabla con chunk + scores (vec, bm25 normalizado, final ponderado).
--
-- Scoring híbrido: final = alpha * vec_score + (1-alpha) * (bm25 / max_bm25_in_batch)
-- Normaliza BM25 al rango [0,1] dividiendo por el máximo del result set.

BEGIN;

CREATE OR REPLACE FUNCTION search_chunks_hybrid(
  query_embedding vector(1536),
  query_text      text,
  alpha           numeric DEFAULT 0.7,
  top_k           int     DEFAULT 20,
  jurisdictions   text[]  DEFAULT NULL,
  block_filter    text    DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  source_id     uuid,
  breadcrumb    text,
  content       text,
  vec_score     numeric,
  bm25_score    numeric,
  final_score   numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH vec AS (
    SELECT c.id, (1 - (c.embedding <=> query_embedding))::numeric AS vs
    FROM knowledge_chunks c
    WHERE c.embedding IS NOT NULL
      AND (block_filter IS NULL OR c.block_key = block_filter)
      AND (jurisdictions IS NULL OR EXISTS (
            SELECT 1 FROM knowledge_sources s
            WHERE s.id = c.source_id AND s.jurisdiction = ANY(jurisdictions)))
    ORDER BY c.embedding <=> query_embedding
    LIMIT 50
  ),
  bm AS (
    SELECT c.id, ts_rank_cd(c.tsv, plainto_tsquery('english', query_text))::numeric AS bs
    FROM knowledge_chunks c
    WHERE (block_filter IS NULL OR c.block_key = block_filter)
      AND (jurisdictions IS NULL OR EXISTS (
            SELECT 1 FROM knowledge_sources s
            WHERE s.id = c.source_id AND s.jurisdiction = ANY(jurisdictions)))
      AND c.tsv @@ plainto_tsquery('english', query_text)
    ORDER BY bs DESC
    LIMIT 50
  ),
  unioned AS (
    SELECT COALESCE(vec.id, bm.id) AS id,
           COALESCE(vec.vs, 0) AS vs,
           COALESCE(bm.bs, 0) AS bs
    FROM vec FULL OUTER JOIN bm ON vec.id = bm.id
  ),
  max_bm AS (SELECT GREATEST(MAX(bs), 0.001::numeric) AS m FROM unioned)
  SELECT c.id,
         c.source_id,
         c.breadcrumb,
         c.content,
         u.vs AS vec_score,
         (u.bs / mb.m)::numeric AS bm25_score,
         (alpha * u.vs + (1 - alpha) * (u.bs / mb.m))::numeric AS final_score
  FROM unioned u
  JOIN knowledge_chunks c ON c.id = u.id
  CROSS JOIN max_bm mb
  ORDER BY final_score DESC
  LIMIT top_k;
END;
$$;

COMMIT;
