-- Una tarjeta Garmin entra una sola vez al historial de cada usuario.
--
-- Desde e21daf32 (14-may) el confirm del import guardaba las tarjetas Garmin nuevas con su id solo en
-- metadata.garmin_scorecard_id, no en la columna que leen el dedup del ZIP y la re-importación: volver a importar
-- el mismo archivo las insertaba de nuevo en vez de actualizarlas. Al 30-oct son 125 filas, ninguna duplicada
-- todavía. Se copia el id a la columna y el índice pasa a único: un import cortado y reintentado, o dos confirm
-- simultáneos, ya no pueden guardar la misma tarjeta dos veces (importRound lo cuenta como duplicada).
--
-- Rollback: supabase/migrations/rollback/20261030_garmin_scorecard_unico_rollback.sql

UPDATE public.historical_rounds
SET garmin_scorecard_id = metadata ->> 'garmin_scorecard_id'
WHERE garmin_scorecard_id IS NULL
  AND metadata ->> 'garmin_scorecard_id' <> '';

DROP INDEX IF EXISTS public.idx_hr_garmin_id;

CREATE UNIQUE INDEX ux_historical_rounds_garmin_scorecard ON public.historical_rounds
  USING btree (user_id, garmin_scorecard_id)
  WHERE garmin_scorecard_id IS NOT NULL;
