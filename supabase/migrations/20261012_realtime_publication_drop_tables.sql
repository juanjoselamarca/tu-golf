-- Golfers+ no longer uses Supabase Realtime (PR #512 and #514, Los Leones tournament outage of
-- 2026-10-04: every start of the Realtime tenant runs DDL, PostgREST reloads its schema cache and,
-- with the database under load, the reload hits statement_timeout and the API goes down).
-- src/ opens no channels (canary: src/__tests__/canary-no-realtime.test.ts).
--
-- The publication still carried the two tables the old live views listened to. Nothing reads them,
-- but logical replication keeps decoding their WAL for the publication. With them gone the
-- publication is empty, and a stray client that subscribes gets no changes.
-- Measured in prod on 2026-10-12 (read-only): exactly these two tables, nothing else.
--
-- Apply outside playing hours (DDL): first `node --env-file=.env.local scripts/ci/evento-en-vivo.mjs`
-- must exit 0.
-- Rollback: supabase/migrations/rollback/20261012_realtime_publication_drop_tables_rollback.sql

ALTER PUBLICATION supabase_realtime DROP TABLE public.rondas_libres, public.ronda_libre_jugadores;
