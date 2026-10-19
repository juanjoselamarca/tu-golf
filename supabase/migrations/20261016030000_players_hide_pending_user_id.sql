-- ============================================================================
-- players.pending_user_id hidden from clients (guest credential)
-- ============================================================================
-- Prod state measured on 2026-10-16 (read-only):
--   * players.pending_user_id is the guestId of a tournament guest: the credential the
--     guest's device holds. anon and authenticated read it through the table-level SELECT
--     grant (has_column_privilege = true for both) and players has a public SELECT policy.
--   * With a guestId taken from players, /guest-join handed back its guest token (score
--     for that guest) and /guest-claim moved the guest's card to any account.
--   * After the code PR (guest-claim requires the token; the scorer finds the guest's row
--     through /api/torneos/[slug]/guest-player), nothing in src/ reads the column with the
--     session client: only service_role routes (game, guest-join, guest-claim,
--     guest-player). src/__tests__/canary-pending-user-id-solo-servidor.test.ts keeps it so.
--   * The only DB function that uses it is enroll_player (SECURITY DEFINER). No policy or
--     view references it and players is not in the realtime publication.
--
-- DEPLOY ORDER: apply ONLY after the code PR is in prod. Before that, the tournament
-- scorer still selects pending_user_id in its roster and would get 42501 for everyone.
--
-- A column-level REVOKE does not override a table-level grant, so anon and authenticated
-- lose SELECT on the table and get it back on every other column (same pattern as
-- 20261009000000_profiles_hide_private_columns.sql). Columns added later need their own
-- GRANT SELECT (col) TO anon, authenticated in the same migration, or the app gets 42501;
-- src/__tests__/canary-column-select.test.ts enforces it. INSERT/UPDATE/DELETE grants are
-- untouched.
--
-- Rollback: supabase/migrations/rollback/20261016_players_hide_pending_user_id_rollback.sql
-- ============================================================================

DO $$
DECLARE
  private_columns text[] := ARRAY['pending_user_id'];
  public_columns text;
  col text;
  client_role text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO public_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'players'
    AND column_name <> ALL (private_columns);

  EXECUTE 'REVOKE SELECT ON public.players FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.players TO anon, authenticated', public_columns);

  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOR col IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'players'
    LOOP
      IF has_column_privilege(client_role, 'public.players', col, 'SELECT')
         = (col = ANY (private_columns)) THEN
        RAISE EXCEPTION 'players.%: unexpected SELECT for % (grant to PUBLIC?)', col, client_role;
      END IF;
    END LOOP;
  END LOOP;
END $$;
