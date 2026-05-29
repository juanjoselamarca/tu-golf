-- 20260528_ola1e_knowledge_sources.sql
--
-- Sub-Ola 1e del cerebro v3: catálogo de fuentes externas de conocimiento.
-- Cada row representa un documento ingerido (PDF de USGA, R&A, WHS, FedeGolf,
-- etc) con sus metadatos de jurisdicción, prioridad y dominio autoritativo
-- para resolver conflictos entre fuentes (USGA vs FedeGolf Chile, por ejemplo).
--
-- RLS: lectura pública (los datos no son personales), escritura solo service_role.

BEGIN;

CREATE TABLE knowledge_sources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text UNIQUE NOT NULL,
  title                 text NOT NULL,
  authors               text[] NOT NULL DEFAULT '{}',
  url_source            text NOT NULL,
  url_local_pdf         text,
  block_key             text NOT NULL,
  jurisdiction          text NOT NULL CHECK (jurisdiction IN
                          ('usga','ra','whs_global','usga_committee','fedegolf_chile')),
  priority_rank         int NOT NULL DEFAULT 100,
  is_authoritative_for  text[] NOT NULL DEFAULT '{}',
  legal_basis           text NOT NULL,
  source_hash           text,
  ingested_at           timestamptz,
  chunk_count           int NOT NULL DEFAULT 0,
  ingest_cost_usd       numeric(8,4) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','ingesting','ready','stale','error','unavailable')),
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_sources_block         ON knowledge_sources (block_key);
CREATE INDEX idx_knowledge_sources_jurisdiction  ON knowledge_sources (jurisdiction);
CREATE INDEX idx_knowledge_sources_status        ON knowledge_sources (status);

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_sources_public_read ON knowledge_sources
  FOR SELECT USING (true);

CREATE POLICY knowledge_sources_service_write ON knowledge_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_knowledge_sources_updated_at ON knowledge_sources;
CREATE TRIGGER trg_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
