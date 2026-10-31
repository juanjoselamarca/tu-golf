-- Rollback de 20261031160000_import_jobs_total_updated.sql: quita la columna.
-- Pierde la cuenta de rondas reescritas de los jobs ya completados (no afecta las rondas). Idempotente.
-- Antes de correrlo, el código del confirm no puede seguir escribiendo ni leyendo la columna.

ALTER TABLE public.import_jobs DROP COLUMN IF EXISTS total_updated;
