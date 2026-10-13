-- ROLLBACK of 20261010_secdef_search_path.sql: both functions go back to the caller's
-- search_path, as measured in prod on 2026-10-10.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/rollback/20261010_secdef_search_path_rollback.sql

ALTER FUNCTION public.exec_sql(text) RESET search_path;
ALTER FUNCTION public.log_role_change() RESET search_path;
