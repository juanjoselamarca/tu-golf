-- ============================================================================
-- match_pairings without public read; telefono_invitado hidden from clients
-- ============================================================================
-- Prod state measured on 2026-10-13 (read-only):
--   * match_pairings has read_match_pairings, a SELECT policy TO public USING (true). The
--     table has 0 rows and nothing in src/ reads it. manage_match_pairings (the round
--     creator, all commands) stays, so the creator still reads their own rows.
--   * ronda_libre_jugadores.telefono_invitado: anon and authenticated read it through the
--     table-level SELECT grant (2 guest phones). The code only writes it (create route);
--     it is never read outside service_role.
--
-- A column-level REVOKE does not override a table-level grant, so anon and authenticated
-- lose SELECT on the table and get it back on every other column (same pattern as
-- 20261009000000_profiles_hide_private_columns.sql). Columns added later need their own
-- GRANT SELECT (col) TO anon, authenticated in the same migration, or the app gets 42501;
-- src/__tests__/canary-column-select.test.ts enforces it. INSERT/UPDATE/DELETE grants are
-- untouched; the create route inserts with .select('id, nombre'), which only needs SELECT
-- on those columns.
--
-- Rollback: supabase/migrations/rollback/20261013_rls_match_pairings_telefono_invitado_rollback.sql
-- ============================================================================

DROP POLICY IF EXISTS read_match_pairings ON public.match_pairings;

DO $$
DECLARE
  private_columns text[] := ARRAY['telefono_invitado'];
  public_columns text;
  col text;
  client_role text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO public_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ronda_libre_jugadores'
    AND column_name <> ALL (private_columns);

  EXECUTE 'REVOKE SELECT ON public.ronda_libre_jugadores FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.ronda_libre_jugadores TO anon, authenticated', public_columns);

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_pairings'
      AND cmd IN ('SELECT', 'ALL')
      AND policyname <> 'manage_match_pairings'
  ) THEN
    RAISE EXCEPTION 'match_pairings still has a read policy other than manage_match_pairings';
  END IF;

  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOR col IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ronda_libre_jugadores'
    LOOP
      IF has_column_privilege(client_role, 'public.ronda_libre_jugadores', col, 'SELECT')
         = (col = ANY (private_columns)) THEN
        RAISE EXCEPTION 'ronda_libre_jugadores.%: unexpected SELECT for % (grant to PUBLIC?)', col, client_role;
      END IF;
    END LOOP;
  END LOOP;
END $$;
