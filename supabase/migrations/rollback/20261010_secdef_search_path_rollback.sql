-- ROLLBACK of 20261010000000_secdef_search_path.sql: both functions go back to the caller's
-- search_path, as measured in prod on 2026-10-10.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: copy it as a new migration (PR → merge → migraciones-prod workflow); run-sql.mjs is read-only.

ALTER FUNCTION public.exec_sql(text) RESET search_path;
ALTER FUNCTION public.log_role_change() RESET search_path;
