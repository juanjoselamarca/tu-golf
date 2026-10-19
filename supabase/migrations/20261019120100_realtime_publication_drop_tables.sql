-- Golfers+ no longer uses Supabase Realtime (PR #512 and #514, after the Los Leones tournament outage
-- of 2026-10-04). src/ opens no channels, and the canary src/__tests__/canary-no-realtime.test.ts
-- enforces that. The canary is what prevents the outage, not this migration.
--
-- The publication still carried the two tables the old live views listened to. Nothing reads them.
-- What this migration buys is limited: if a stray client ever subscribes, Postgres no longer decodes
-- the WAL of these two tables for it. It does NOT stop the Realtime tenant from starting.
-- Measured in prod on 2026-10-19 (read-only): puballtables = false; exactly these two tables.
--
-- Idempotent: each table is dropped only if it is still in the publication.
-- Apply outside playing hours (DDL): first `node --env-file=.env.local scripts/ci/evento-en-vivo.mjs`
-- must exit 0.
-- Rollback: supabase/migrations/rollback/20261012_realtime_publication_drop_tables_rollback.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rondas_libres') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.rondas_libres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ronda_libre_jugadores') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.ronda_libre_jugadores;
  END IF;
END $$;
