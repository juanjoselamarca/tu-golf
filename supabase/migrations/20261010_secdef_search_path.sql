-- SECURITY DEFINER functions without a fixed search_path resolve unqualified names with
-- the caller's search_path (Supabase advisor: function_search_path_mutable). In prod on
-- 2026-10-10 (read-only) only these two in public lack it.
--
-- exec_sql keeps extensions: it runs arbitrary SQL from the admin console, and today its
-- PostgREST callers get "public, extensions" (pgcrypto and uuid-ossp live there).
--
-- Rollback: supabase/migrations/rollback/20261010_secdef_search_path_rollback.sql

ALTER FUNCTION public.exec_sql(text) SET search_path = public, extensions;
ALTER FUNCTION public.log_role_change() SET search_path = public;
