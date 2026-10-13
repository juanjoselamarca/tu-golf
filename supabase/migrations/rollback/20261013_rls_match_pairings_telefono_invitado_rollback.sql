-- ROLLBACK of 20261013_rls_match_pairings_telefono_invitado.sql: public read of
-- match_pairings and table-level SELECT on ronda_libre_jugadores, as measured in prod on
-- 2026-10-13.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/rollback/20261013_rls_match_pairings_telefono_invitado_rollback.sql

DROP POLICY IF EXISTS read_match_pairings ON public.match_pairings;
CREATE POLICY read_match_pairings ON public.match_pairings FOR SELECT USING (true);

-- The table-level REVOKE also clears the column grants, so the GRANT restores the exact prior state.
REVOKE SELECT ON public.ronda_libre_jugadores FROM anon, authenticated;
GRANT SELECT ON public.ronda_libre_jugadores TO anon, authenticated;
