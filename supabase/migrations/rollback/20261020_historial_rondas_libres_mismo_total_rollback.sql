-- Rollback de 20261020170000_historial_rondas_libres_mismo_total.sql.
-- Falla si ya entraron dos rondas libres del mismo jugador, día, cancha y total: son rondas distintas, no se borran.
-- Revisar antes con
--   SELECT user_id, played_at, course_id, total_gross, count(*) FROM public.historical_rounds
--   WHERE course_id IS NOT NULL GROUP BY 1, 2, 3, 4 HAVING count(*) > 1;

DROP INDEX IF EXISTS public.uq_historical_user_date_course_gross;

CREATE UNIQUE INDEX uq_historical_user_date_course_gross ON public.historical_rounds
  USING btree (user_id, played_at, course_id, total_gross)
  WHERE course_id IS NOT NULL;
