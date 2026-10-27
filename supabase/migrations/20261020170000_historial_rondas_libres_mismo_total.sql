-- Dos rondas libres distintas del mismo día, cancha y total bruto entran las dos al historial.
--
-- uq_historical_user_date_course_gross (#314) frena la doble finalización con (user_id, played_at, course_id,
-- total_gross), pero esa no es la identidad de una tarjeta de ronda libre: la vuelta de un 9+9 o la 2.ª ronda de un
-- 36 hoyos con el mismo total chocaba, guardarTarjetaEnHistorial leía el 23505 como "ya estaba guardada" y la ronda no
-- entraba al historial ni al índice. Esas filas ya tienen su clave, ux_historical_rounds_ronda_libre_jugador
-- (metadata.ronda_libre_jugador_id): el índice viejo deja de aplicarles. Las demás (importaciones, torneo) siguen igual.
-- metadata admite NULL: sin el COALESCE, esas filas quedarían fuera del índice.
--
-- Rollback: supabase/migrations/rollback/20261020_historial_rondas_libres_mismo_total_rollback.sql

DROP INDEX IF EXISTS public.uq_historical_user_date_course_gross;

CREATE UNIQUE INDEX uq_historical_user_date_course_gross ON public.historical_rounds
  USING btree (user_id, played_at, course_id, total_gross)
  WHERE course_id IS NOT NULL AND NOT COALESCE(metadata ? 'ronda_libre_jugador_id', false);
