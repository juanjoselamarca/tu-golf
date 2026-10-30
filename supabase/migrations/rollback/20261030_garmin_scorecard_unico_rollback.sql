-- Rollback de 20261030170000_garmin_scorecard_unico.sql: el índice vuelve a ser no único.
-- El id copiado a la columna se deja: es el mismo de metadata y el dedup del ZIP lo necesita.
-- No pierde datos. Idempotente.

DROP INDEX IF EXISTS public.ux_historical_rounds_garmin_scorecard;

CREATE INDEX IF NOT EXISTS idx_hr_garmin_id ON public.historical_rounds
  USING btree (user_id, garmin_scorecard_id)
  WHERE garmin_scorecard_id IS NOT NULL;
