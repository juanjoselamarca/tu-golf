-- 20260529_ola1e_embedding_gemini.sql
--
-- Pivote del provider de embeddings del RAG (decisión Juanjo 2026-05-29):
-- OpenAI text-embedding-3-small → Gemini gemini-embedding-001 (outputDimensionality
-- 1536, free tier). Mantiene vector(1536) → sin migración de schema en
-- knowledge_chunks. Solo actualiza el catálogo llm_models (rol 'embedding').

BEGIN;

-- Desactivar la fila vieja de OpenAI (la dejamos por historial, status retired).
UPDATE llm_models
SET status = 'retired'
WHERE model_id = 'openai/text-embedding-3-small';

-- Alta/activación del embedding de Gemini.
INSERT INTO llm_models (model_id, role, status, context_window, cost_per_1m_tokens_input, cost_per_1m_tokens_output, embedding_dim, fallback_to_model_id, config)
VALUES ('google/gemini-embedding-001', 'embedding', 'active', NULL, 0.0, NULL, 1536, NULL, '{"provider":"gemini","output_dimensionality":1536,"free_tier":true}')
ON CONFLICT (model_id) DO UPDATE
  SET role = EXCLUDED.role,
      status = 'active',
      embedding_dim = EXCLUDED.embedding_dim,
      cost_per_1m_tokens_input = EXCLUDED.cost_per_1m_tokens_input,
      config = EXCLUDED.config;

COMMIT;
