-- 20260528_ola1e_knowledge_chunks.sql
--
-- Sub-Ola 1e del cerebro v3: chunks de conocimiento vectorizados.
-- Cada row representa un chunk parseado de un documento (Rule/Sub-rule/Paragraph
-- estructural en reglas oficiales, o chunk de tamaño en fallback).
--
-- Búsqueda híbrida: vector cosine (pgvector) + full-text search (tsvector
-- generado automáticamente del content). Idempotencia: UNIQUE (source_id, chunk_hash)
-- permite re-ingerir sin duplicar.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE knowledge_chunks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  block_key           text NOT NULL,
  breadcrumb          text NOT NULL,
  rule_anchor         text,
  content             text NOT NULL,
  contextual_prefix   text,
  content_for_embed   text NOT NULL,
  embedding           vector(1536),
  tsv                 tsvector GENERATED ALWAYS AS
                        (to_tsvector('english', coalesce(content,''))) STORED,
  chunk_hash          text NOT NULL,
  page_start          int,
  page_end            int,
  token_count         int NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, chunk_hash)
);

-- ivfflat para búsqueda vectorial aproximada (lists=100 alcanza para ~9k chunks)
CREATE INDEX idx_knowledge_chunks_embedding
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- GIN para full-text search
CREATE INDEX idx_knowledge_chunks_tsv         ON knowledge_chunks USING gin (tsv);
CREATE INDEX idx_knowledge_chunks_source      ON knowledge_chunks (source_id);
CREATE INDEX idx_knowledge_chunks_block       ON knowledge_chunks (block_key);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_chunks_public_read ON knowledge_chunks
  FOR SELECT USING (true);

CREATE POLICY knowledge_chunks_service_write ON knowledge_chunks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
