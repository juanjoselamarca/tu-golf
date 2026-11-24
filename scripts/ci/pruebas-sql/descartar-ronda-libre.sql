-- Pruebas SQL de 20261124120000_descartar_solo_ronda_en_curso con ROLES REALES (authenticated + su JWT), contra el
-- Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige: descartar_ronda_libre no borra una ronda cerrada (P0002) ni una en curso con alguna tarjeta ya guardada
-- en un historial (P0003 'ronda con tarjetas guardadas'), y sigue borrando la ronda en curso de su creador cuando
-- nadie guardó. El orden de los chequeos se mantiene: permiso (ajeno, demo) y torneo antes que el estado.
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'creador@prueba.test'),
  ('b2000000-0000-4000-8000-000000000002', 'ajeno@prueba.test');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado, es_demo) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'DESCEC', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso', false),
  ('d2000000-0000-4000-8000-000000000002', 'DESCFI', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'finalizada', false),
  ('d2000000-0000-4000-8000-000000000003', 'DESCTO', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'finalizada', false),
  ('d2000000-0000-4000-8000-000000000004', 'DESCDE', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'finalizada', true),
  ('d2000000-0000-4000-8000-000000000005', 'DESCHI', 'Cancha', current_date,
   'a2000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso', false);

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, scores) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'Creador',
   'a2000000-0000-4000-8000-000000000001', 12, '{"1": 5}'::jsonb),
  ('e2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'Creador',
   'a2000000-0000-4000-8000-000000000001', 12, '{"1": 5}'::jsonb),
  ('e2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000005', 'Creador',
   'a2000000-0000-4000-8000-000000000001', 12, '{"1": 5}'::jsonb),
  ('e2000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000005', 'Amigo',
   'b2000000-0000-4000-8000-000000000002', 20, '{"1": 6}'::jsonb);

-- DESCHI sigue en curso, pero el amigo ya finalizó y su tarjeta está en su historial.
INSERT INTO public.historical_rounds (user_id, course_name, played_at, holes_played, metadata) VALUES
  ('b2000000-0000-4000-8000-000000000002', 'Cancha', current_date, 18,
   '{"ronda_libre_jugador_id": "e2000000-0000-4000-8000-000000000004"}'::jsonb);

-- DESCTO es de un torneo.
INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'Torneo prueba', 'torneo-prueba-descartar',
   'a2000000-0000-4000-8000-000000000001', current_date);
INSERT INTO public.tournament_groups (tournament_id, name, ronda_libre_id) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'Grupo 1', 'd2000000-0000-4000-8000-000000000003');

-- ── Quien no es el creador: permiso antes que estado ─────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b2000000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('DESCFI');
  RAISE EXCEPTION 'FALLA: un ajeno descartó una ronda cerrada';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  RAISE NOTICE 'OK un ajeno no descarta (P0003), aunque la ronda esté cerrada';
END $$;

-- ── El creador ───────────────────────────────────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('DESCFI');
  RAISE EXCEPTION 'FALLA: el creador descartó una ronda finalizada';
EXCEPTION WHEN SQLSTATE 'P0002' THEN
  RAISE NOTICE 'OK una ronda finalizada no se descarta (P0002)';
END $$;

-- Torneo antes que estado: una ronda de torneo finalizada sigue diciendo «ronda de torneo».
DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.descartar_ronda_libre('DESCTO');
  RAISE EXCEPTION 'FALLA: el creador descartó una ronda de torneo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'ronda de torneo' THEN
    RAISE EXCEPTION 'FALLA: ronda de torneo finalizada con DETAIL %', v_detail;
  END IF;
  RAISE NOTICE 'OK una ronda de torneo finalizada responde «ronda de torneo» (P0003)';
END $$;

-- Demo antes que estado: P0003 sin DETAIL.
DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.descartar_ronda_libre('DESCDE');
  RAISE EXCEPTION 'FALLA: el creador descartó una ronda demo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF coalesce(v_detail, '') <> '' THEN
    RAISE EXCEPTION 'FALLA: ronda demo finalizada con DETAIL %', v_detail;
  END IF;
  RAISE NOTICE 'OK una ronda demo finalizada responde permiso (P0003)';
END $$;

-- En curso, pero con una tarjeta ya en un historial: no se descarta.
DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.descartar_ronda_libre('DESCHI');
  RAISE EXCEPTION 'FALLA: el creador descartó una ronda con una tarjeta guardada';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'ronda con tarjetas guardadas' THEN
    RAISE EXCEPTION 'FALLA: ronda con tarjeta guardada con DETAIL %', v_detail;
  END IF;
  RAISE NOTICE 'OK una ronda en curso con una tarjeta guardada no se descarta (P0003)';
END $$;

-- En curso, con jugadores y sin tarjetas guardadas: se descarta.
DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('DESCEC');
  RAISE NOTICE 'OK el creador descarta su ronda en curso';
END $$;

-- ── Lo que quedó (como postgres) ─────────────────────────────────────────────────────────────────────────────
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rondas_libres WHERE codigo = 'DESCFI') THEN
    RAISE EXCEPTION 'FALLA: la ronda finalizada ya no está';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE ronda_id = 'd2000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FALLA: la tarjeta de la ronda finalizada ya no está';
  END IF;
  IF (SELECT count(*) FROM public.ronda_libre_jugadores WHERE ronda_id = 'd2000000-0000-4000-8000-000000000005') <> 2 THEN
    RAISE EXCEPTION 'FALLA: la ronda con una tarjeta guardada perdió jugadores';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rondas_libres WHERE codigo = 'DESCEC') THEN
    RAISE EXCEPTION 'FALLA: la ronda en curso no se borró';
  END IF;
  RAISE NOTICE 'OK la finalizada y la de tarjeta guardada siguen; la en curso sin tarjetas se borró';
END $$;

ROLLBACK;
