-- Pruebas SQL de los permisos de anon (20261029120000_anon_sin_permisos_de_tabla, 20261029200000_anon_restos_capa3)
-- con el rol real, contra el Postgres desechable del check `esquema`. Las policies de las tablas que anon lee se
-- evalúan con su rol: si una lee en una subconsulta una tabla o columna que anon ya no tiene, el SELECT da 42501
-- aunque la tabla esté vacía (el permiso se chequea al iniciar la consulta). Los canarios del catálogo no lo ven;
-- esto lo ejecuta.
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

DO $$ BEGIN
  PERFORM avatar_url, id, indice, indice_golfers, name, nivel FROM public.profiles LIMIT 1;
  RAISE NOTICE 'OK anon lee las columnas de profiles de /ranking, /api/health y los embeds de torneo';
END $$;

DO $$ BEGIN
  PERFORM role FROM public.profiles LIMIT 1;
  RAISE EXCEPTION 'FALLA: anon leyó profiles.role';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon: sin SELECT de profiles.role -> 42501';
END $$;

DO $$ BEGIN
  PERFORM nextval('public.coach_events_id_seq');
  RAISE EXCEPTION 'FALLA: anon usó coach_events_id_seq';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon: sin USAGE de secuencias -> 42501';
END $$;

-- Por catálogo: el cuerpo (SECURITY INVOKER) hace UPDATE de round_metrics, que anon no tiene, y daría 42501 aunque
-- conservara EXECUTE. Los dos roles son miembros de PUBLIC, así que cubre también ese grant.
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.restamp_round_metrics_target(uuid,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.restamp_round_metrics_target(uuid,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: anon o authenticated tiene EXECUTE de restamp_round_metrics_target';
  END IF;
  RAISE NOTICE 'OK anon y authenticated: sin EXECUTE de restamp_round_metrics_target';
END $$;

ROLLBACK;
