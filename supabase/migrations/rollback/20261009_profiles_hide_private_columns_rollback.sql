-- ROLLBACK of 20261009_profiles_hide_private_columns.sql
-- Restores the prod state measured on 2026-10-09 (read-only): table-level SELECT on
-- profiles for anon and authenticated, as left by 20260910_grant_select_profiles.sql.
-- The migration's column-level grants stay, but the table-level grant covers them.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/rollback/20261009_profiles_hide_private_columns_rollback.sql

GRANT SELECT ON public.profiles TO anon, authenticated;
