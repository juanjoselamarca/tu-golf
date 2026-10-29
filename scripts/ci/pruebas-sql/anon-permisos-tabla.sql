-- Pruebas SQL de los permisos de tabla de anon (20261029120000_anon_sin_permisos_de_tabla) con el rol real, contra
-- el Postgres desechable del check `esquema`. Las policies de las tablas que anon lee se evalúan con su rol: si una
-- lee en una subconsulta una tabla o columna que anon ya no tiene, el SELECT da 42501 aunque la tabla esté vacía
-- (el permiso se chequea al iniciar la consulta). Los canarios del catálogo no lo ven; esto lo ejecuta.
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'course_holes', 'course_tees', 'courses', 'historical_rounds', 'tournament_rounds', 'tournaments',
    'hole_scores', 'players', 'rounds', 'tournament_groups', 'tournament_group_players', 'rondas_libres',
    'ronda_libre_jugadores', 'ronda_equipos', 'ronda_equipo_jugadores', 'profiles'
  ] LOOP
    EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
  END LOOP;
  RAISE NOTICE 'OK anon lee las tablas de las páginas sin sesión, policies incluidas';
END $$;

DO $$ BEGIN
  INSERT INTO public.analytics_events (event_type) VALUES ('prueba');
  INSERT INTO public.error_logs (message, level) VALUES ('prueba', 'info');
  RAISE NOTICE 'OK anon inserta en analytics_events y error_logs';
END $$;

DO $$ BEGIN
  PERFORM 1 FROM public.push_subscriptions LIMIT 1;
  RAISE EXCEPTION 'FALLA: anon leyó push_subscriptions';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon: sin SELECT de push_subscriptions -> 42501';
END $$;

ROLLBACK;
