-- Rondas que un import de Garmin reescribió porque ya estaban en el historial. total_imported cuenta solo las
-- nuevas. SOLO schema, aditivo.
--
-- Para qué: si la conexión se corta mientras /api/import/confirm guarda, el servidor termina y deja el job
-- completado, y el reintento del jugador respondía "Este job ya fue completado" aunque sus rondas quedaron
-- guardadas. El confirm va a responder éxito con lo que guardó el job; para mostrar lo mismo que la primera
-- respuesta necesita las dos cuentas.
--
-- Va en un PR propio, ANTES del código que la escribe y la lee (docs/CONVENCIONES_TECNICAS.md).
-- NULL = job anterior a esta columna o que no terminó.
--
-- Rollback: supabase/migrations/rollback/20261031_import_jobs_total_updated_rollback.sql

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS total_updated integer NULL;

COMMENT ON COLUMN public.import_jobs.total_updated IS
  'Rondas que el confirm reescribió (duplicados Garmin). total_imported cuenta solo las nuevas. NULL = job anterior a la columna o sin completar.';
