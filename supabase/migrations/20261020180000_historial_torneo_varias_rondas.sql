-- Dos rondas de un torneo jugadas el mismo día, en la misma cancha y con el mismo total bruto entran las dos al
-- historial.
--
-- La fila de torneo no tenía clave propia: la frenaba uq_historical_user_date_course_gross (user_id, played_at,
-- course_id, total_gross) y en un torneo de 36 hoyos en un día la 2.ª ronda con el mismo total chocaba: el insert
-- fallaba y la ronda no entraba al historial ni al índice. guardarRondaDeTorneoEnHistorial ahora guarda la ronda
-- en metadata.tournament_round_id; esa es la clave de la fila y el índice viejo deja de aplicarle. Las filas de
-- torneo anteriores no la tienen y siguen bajo el índice viejo.
--
-- Rollback: supabase/migrations/rollback/20261020_historial_torneo_varias_rondas_rollback.sql

CREATE UNIQUE INDEX IF NOT EXISTS ux_historical_rounds_tournament_round ON public.historical_rounds
  USING btree ((metadata ->> 'tournament_round_id'))
  WHERE metadata ? 'tournament_round_id';

DROP INDEX IF EXISTS public.uq_historical_user_date_course_gross;

CREATE UNIQUE INDEX uq_historical_user_date_course_gross ON public.historical_rounds
  USING btree (user_id, played_at, course_id, total_gross)
  WHERE course_id IS NOT NULL
    AND NOT COALESCE(metadata ? 'ronda_libre_jugador_id' OR metadata ? 'tournament_round_id', false);
