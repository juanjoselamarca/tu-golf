-- ROLLBACK of 20261016030000_players_hide_pending_user_id.sql: table-level SELECT on players
-- (pending_user_id readable by clients again), as measured in prod on 2026-10-16.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
GRANT SELECT ON public.players TO anon, authenticated;
