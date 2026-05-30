-- 20260529_ola1e_tsv_simple.sql
--
-- I1 (code review sub-ola 1e): el corpus RAG es BILINGÜE. El reglamento de
-- FedeGolf Chile está en español y la tool invita queries en español. El
-- stemmer 'english' produce lexemas inútiles para texto en español, anulando
-- la mitad BM25 del hybrid search justo en el caso bilingüe que el feature
-- existe para servir. 'simple' es agnóstico de idioma (sin stemming) y matchea
-- tanto español como inglés de forma consistente.
--
-- Tablas vacías al momento de aplicar (ingesta real aún no corrió), así que
-- recrear la columna generada + índice es trivial y sin pérdida de datos.

BEGIN;

-- La columna generada no se puede ALTERar in-place: drop índice → drop col → recrear.
DROP INDEX IF EXISTS idx_knowledge_chunks_tsv;
ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS tsv;
ALTER TABLE knowledge_chunks
  ADD COLUMN tsv tsvector GENERATED ALWAYS AS
    (to_tsvector('simple', coalesce(content, ''))) STORED;
CREATE INDEX idx_knowledge_chunks_tsv ON knowledge_chunks USING gin (tsv);

-- Recrear la RPC usando 'simple' en ambos plainto_tsquery.
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
    SELECT c.id, ts_rank_cd(c.tsv, plainto_tsquery('simple', query_text))::numeric AS bs
    FROM knowledge_chunks c
    WHERE (block_filter IS NULL OR c.block_key = block_filter)
      AND (jurisdictions IS NULL OR EXISTS (
            SELECT 1 FROM knowledge_sources s
            WHERE s.id = c.source_id AND s.jurisdiction = ANY(jurisdictions)))
      AND c.tsv @@ plainto_tsquery('simple', query_text)
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
