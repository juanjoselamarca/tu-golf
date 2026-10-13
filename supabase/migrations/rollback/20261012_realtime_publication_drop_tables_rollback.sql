-- ROLLBACK of 20261012_realtime_publication_drop_tables.sql: both tables go back into the
-- supabase_realtime publication, as measured in prod on 2026-10-12.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/rollback/20261012_realtime_publication_drop_tables_rollback.sql

ALTER PUBLICATION supabase_realtime ADD TABLE public.rondas_libres, public.ronda_libre_jugadores;
