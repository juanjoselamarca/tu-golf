-- ============================================================================
-- Coach tables: no public read
-- ============================================================================
-- Prod state measured on 2026-10-12 (read-only): knowledge_chunks, knowledge_sources,
-- llm_models and pattern_definitions have a SELECT policy TO public USING (true), so the
-- anon key alone downloads the whole RAG corpus (Golfers+ curated content and embeddings
-- included), its sources, the model registry and the pattern catalog.
--
-- Readers in the code:
--   * knowledge_chunks, knowledge_sources: service_role only (coach retrieval, admin
--     sources page, ingest scripts). search_chunks_hybrid is SECURITY INVOKER and is
--     only called with service_role, so anon and authenticated lose EXECUTE too. A later
--     DROP + CREATE (or a new signature) gets EXECUTE back from the default privileges;
--     src/__tests__/canary-search-chunks-hybrid-execute.test.ts requires the REVOKE in
--     that same migration.
--   * llm_models: service_role only (src/lib/cerebro/llm-models.ts). The admin write
--     policy stays.
--   * pattern_definitions: the user's session (focus catalog in /api/coach/progress and
--     the coach focus tools), so it stays readable by authenticated.
--
-- Write policies are untouched (service_role, and admins on llm_models).
--
-- Rollback: supabase/migrations/rollback/20261012_coach_tables_private_read_rollback.sql
-- ============================================================================

DROP POLICY IF EXISTS knowledge_chunks_public_read ON public.knowledge_chunks;
DROP POLICY IF EXISTS knowledge_sources_public_read ON public.knowledge_sources;
DROP POLICY IF EXISTS llm_models_read_public ON public.llm_models;
ALTER POLICY pattern_definitions_read ON public.pattern_definitions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_chunks_hybrid FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('SELECT', 'ALL')
      AND tablename IN ('knowledge_chunks', 'knowledge_sources', 'llm_models', 'pattern_definitions')
      AND (
        roles && ARRAY['public', 'anon']::name[]
        OR (
          roles && ARRAY['authenticated']::name[]
          AND (tablename, policyname) NOT IN (
            ('llm_models', 'llm_models_write_admin'),
            ('pattern_definitions', 'pattern_definitions_read')
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'a coach table is still readable by anon or by an unexpected session policy';
  END IF;

  IF has_function_privilege('anon', 'public.search_chunks_hybrid'::regproc, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.search_chunks_hybrid'::regproc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.search_chunks_hybrid'::regproc, 'EXECUTE') THEN
    RAISE EXCEPTION 'search_chunks_hybrid EXECUTE is not service_role only';
  END IF;
END $$;
