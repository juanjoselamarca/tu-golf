-- 20260528_ola1e_rag_query_log.sql
--
-- Sub-Ola 1e del cerebro v3: observabilidad de retrieval.
-- Cada llamada a searchKnowledgeChunks() inserta un row con métricas:
-- latencia, costo, scores top/bottom, cantidad de candidatos pre/post rerank,
-- y error_code cuando algo falla. Esto alimenta admin dashboard + alertas Sentry.
--
-- RLS: el usuario lee solo sus propias queries. service_role accede a todo.

BEGIN;

CREATE TABLE rag_query_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  query                 text NOT NULL,
  query_embedding       vector(1536),
  jurisdictions_filter  text[],
  top_k_requested       int NOT NULL,
  hybrid_alpha          numeric(3,2) NOT NULL,
  total_candidates      int NOT NULL,
  returned_count        int NOT NULL,
  top_score             numeric(8,6),
  bottom_score          numeric(8,6),
  cited_chunk_ids       uuid[] NOT NULL,
  latency_ms            int NOT NULL,
  cost_usd              numeric(10,8) NOT NULL,
  embedding_model       text NOT NULL,
  reranker_model        text NOT NULL,
  error_code            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_query_log_user    ON rag_query_log (user_id);
CREATE INDEX idx_rag_query_log_created ON rag_query_log (created_at DESC);
CREATE INDEX idx_rag_query_log_errors  ON rag_query_log (error_code) WHERE error_code IS NOT NULL;

ALTER TABLE rag_query_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY rag_query_log_user_read ON rag_query_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY rag_query_log_service_all ON rag_query_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
