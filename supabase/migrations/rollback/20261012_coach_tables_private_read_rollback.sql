-- ROLLBACK of 20261012000000_coach_tables_private_read.sql: public read of the four coach
-- tables and EXECUTE on search_chunks_hybrid, as measured in prod on 2026-10-12.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: copy it as a new migration (PR → merge → migraciones-prod workflow); run-sql.mjs is read-only.

DROP POLICY IF EXISTS knowledge_chunks_public_read ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_public_read ON public.knowledge_chunks FOR SELECT USING (true);
DROP POLICY IF EXISTS knowledge_sources_public_read ON public.knowledge_sources;
CREATE POLICY knowledge_sources_public_read ON public.knowledge_sources FOR SELECT USING (true);
DROP POLICY IF EXISTS llm_models_read_public ON public.llm_models;
CREATE POLICY llm_models_read_public ON public.llm_models FOR SELECT USING (true);
ALTER POLICY pattern_definitions_read ON public.pattern_definitions TO public;

GRANT EXECUTE ON FUNCTION public.search_chunks_hybrid TO PUBLIC, anon, authenticated;
