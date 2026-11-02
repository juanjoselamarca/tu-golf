-- Tarjetas que el confirm de un import NO guardó (duplicadas o con error), con el tempId de cada una. SOLO schema, aditivo.
--
-- Para qué: si la conexión se corta mientras /api/import/confirm guarda, el reintento responde lo que guardó el job
-- (total_imported, total_updated), pero sin esto pierde cuáles no se guardaron: la celebración decía "3 guardadas" sin
-- "1 no se pudo guardar", y preguntaba el tee por tarjetas que no están en el historial.
-- Forma: {"errors": [{"tempId", "error"}], "duplicates": [{"tempId", "course", "date"}]}, lo mismo que responde el confirm.
--
-- Va en un PR propio, ANTES del código que la escribe y la lee (docs/CONVENCIONES_TECNICAS.md).
-- NULL = job anterior a esta columna o que no terminó.
--
-- Rollback: supabase/migrations/rollback/20261031_import_jobs_unsaved_rounds_rollback.sql

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS unsaved_rounds jsonb NULL;

COMMENT ON COLUMN public.import_jobs.unsaved_rounds IS
  'Tarjetas que el confirm no guardó: {errors: [{tempId, error}], duplicates: [{tempId, course, date}]}. NULL = job anterior a la columna o sin completar.';
