-- 20260707_cerebro_v3_ola1cd_coaching_corpus.sql
--
-- Sub-olas 1c (estrategia) + 1d (psicología) del cerebro v3.
--
-- El corpus de coaching (gestión de campo / strokes gained + psicología del
-- rendimiento) es conocimiento CUALITATIVO citado que vive en las tablas
-- existentes `knowledge_sources` + `knowledge_chunks` (mismo RAG que reglas,
-- sub-ola 1e). No requiere tablas nuevas: knowledge_chunks es genérico.
--
-- Único cambio de schema: el CHECK de `knowledge_sources.jurisdiction` es una
-- lista cerrada pensada para reglas (usga/ra/whs/fedegolf). El corpus de
-- coaching no tiene "jurisdicción" reglamentaria: usa el valor 'coaching' para
-- diferenciarse (el dominio fino lo da block_key: 'strategy' / 'psychology').
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD.

BEGIN;

ALTER TABLE knowledge_sources DROP CONSTRAINT IF EXISTS knowledge_sources_jurisdiction_check;

-- NB: el set vivo usa 'randa' (no 'ra') y 'external_prior' (1b). Se preservan
-- TODOS los valores existentes tal cual + 'coaching'.
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_jurisdiction_check
  CHECK (jurisdiction IN (
    'usga', 'randa', 'usga_committee', 'whs_global', 'fedegolf_chile',
    'external_prior',  -- agregado en 1b (external_priors_*)
    'coaching'         -- agregado en 1c/1d (estrategia + psicología)
  ));

COMMIT;
