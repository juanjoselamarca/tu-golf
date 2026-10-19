-- ROLLBACK of 20261019120100_realtime_publication_drop_tables.sql: both tables go back into the
-- supabase_realtime publication, as measured in prod on 2026-10-19.
--
-- Lives in rollback/ so the Supabase CLI NEVER picks it up as a migration.
-- Apply: copy it as a new migration (PR → merge → migraciones-prod workflow); run-sql.mjs is read-only.
-- Idempotent: each table is added only if it is not already in the publication.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rondas_libres') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rondas_libres;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ronda_libre_jugadores') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ronda_libre_jugadores;
  END IF;
END $$;
