-- Rollback de 20261013200000_historical_rounds_adjusted_gross.sql (issue #545).
-- Borra la columna; los diferenciales ya escritos quedan como están.
ALTER TABLE public.historical_rounds
  DROP COLUMN IF EXISTS adjusted_gross;
