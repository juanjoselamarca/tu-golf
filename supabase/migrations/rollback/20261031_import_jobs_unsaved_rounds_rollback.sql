-- Rollback de 20261031190000_import_jobs_unsaved_rounds.sql: quita la columna.
-- Pierde qué tarjetas no se guardaron en los jobs ya completados (no afecta las rondas). Idempotente.
-- Antes de correrlo, el código del confirm no puede seguir escribiendo ni leyendo la columna.

ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS unsaved_rounds;
