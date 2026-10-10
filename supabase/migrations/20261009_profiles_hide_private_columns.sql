-- ============================================================================
-- profiles: email and fecha_nacimiento are no longer readable by the session
-- ============================================================================
-- Prod state measured on 2026-10-09 (read-only):
--   * only SELECT policy: "Profiles solo autenticados", TO authenticated USING (true)
--   * table-level SELECT for anon and authenticated (20260910_grant_select_profiles.sql)
--   => any account reads email and fecha_nacimiento of every profile.
--
-- A column-level REVOKE is not enough: Postgres does not subtract it from a table-level
-- grant. Table-level SELECT is revoked and SELECT is granted per column, all but the
-- private ones. Columns added later need their own GRANT SELECT (col) in the same
-- migration; src/__tests__/canary-profiles-column-select.test.ts enforces it.
-- Otherwise September repeats: coach_access_enabled was created without a grant, the
-- app got 42501 and the fix (#357) reopened SELECT on the whole table.
--
-- Only service_role keeps reading these columns: admin routes, /api/profiles/search,
-- /api/torneos/draft/[id] and /api/fedegolf/vincular. Users see their own email through
-- auth.getUser(), not profiles. Policies that query profiles only use id and role.
--
-- Rollback: supabase/migrations/rollback/20261009_profiles_hide_private_columns_rollback.sql
-- ============================================================================

DO $$
DECLARE
  private_columns text[] := ARRAY['email', 'fecha_nacimiento'];
  public_columns text;
  col text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO public_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name <> ALL (private_columns);

  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon, authenticated';
  EXECUTE format(
    'REVOKE SELECT (%s) ON public.profiles FROM anon, authenticated',
    (SELECT string_agg(quote_ident(c), ', ') FROM unnest(private_columns) c)
  );
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', public_columns);

  FOREACH col IN ARRAY private_columns LOOP
    IF has_column_privilege('anon', 'public.profiles', col, 'SELECT')
       OR has_column_privilege('authenticated', 'public.profiles', col, 'SELECT') THEN
      RAISE EXCEPTION 'profiles.% is still readable by the session (grant to PUBLIC?)', col;
    END IF;
  END LOOP;
END $$;
