-- Pruebas SQL de 20261125120000_guardar_tarjeta_ronda_libre_con_lock con ROLES REALES (authenticated + su JWT),
-- contra el Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige:
--   1. Permisos: solo se guarda en el historial propio (42501) y solo la tarjeta propia (42501 'tarjeta ajena'); sin
--      ronda_libre_jugador_id, 22023; con un jugador que no existe, P0001. anon no la ejecuta.
--   2. El guardado inserta la fila con los defaults de la tabla y devuelve su id; el segundo da 23505 (`duplicada`).
--   3. El cruce con «Descartar ronda» (la carrera EXISTS→DELETE de #868), con DOS sesiones de verdad (dblink):
--      · un guardado sin confirmar bloquea al descarte (lock_timeout → 55P03) y, ya confirmado, el descarte rechaza
--        con P0003 'ronda con tarjetas guardadas';
--      · un descarte sin confirmar bloquea al guardado (55P03), y con la ronda ya borrada el guardado da P0001.
--   Sin el FOR SHARE de la función, los dos 55P03 no ocurren (el INSERT no toca la ronda) y la prueba falla.
--
-- La sesión principal corre en transacciones que terminan en ROLLBACK. Las filas del cruce las confirma la otra
-- sesión (si no, no las vería) y se borran al final, junto con dblink; los ids son propios de esta prueba.

-- dblink fuera de la transacción: la conexión a la otra sesión se usa también después del ROLLBACK.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

BEGIN;

-- ── Datos de la parte 1 y 2 (como postgres, sin confirmar) ───────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a3000000-0000-4000-8000-000000000001', 'creador-gt@prueba.test'),
  ('b3000000-0000-4000-8000-000000000002', 'amigo-gt@prueba.test');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d3000000-0000-4000-8000-000000000001', 'GUARDA', 'Cancha', current_date,
   'a3000000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso');

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, scores) VALUES
  ('e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'Creador',
   'a3000000-0000-4000-8000-000000000001', 12, '{"1": 5}'::jsonb),
  ('e3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 'Amigo',
   'b3000000-0000-4000-8000-000000000002', 20, '{"1": 6}'::jsonb);

-- ── Parte 1: permisos ────────────────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre('{}'::jsonb);
  RAISE EXCEPTION 'FALLA: anon ejecutó guardar_tarjeta_ronda_libre';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'OK anon no la ejecuta';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b3000000-0000-4000-8000-000000000002","role":"authenticated"}';

-- El amigo intenta guardar en el historial del creador.
DO $$ BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'a3000000-0000-4000-8000-000000000001', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 18, 'scores', '[5]'::jsonb,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3000000-0000-4000-8000-000000000001')));
  RAISE EXCEPTION 'FALLA: se guardó en un historial ajeno';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'OK no se guarda en un historial ajeno (42501)';
END $$;

-- El amigo intenta ocupar con SU historial la tarjeta del creador.
DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3000000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 18, 'scores', '[5]'::jsonb,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3000000-0000-4000-8000-000000000001')));
  RAISE EXCEPTION 'FALLA: se guardó una tarjeta ajena';
EXCEPTION WHEN insufficient_privilege THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'tarjeta ajena' THEN
    RAISE EXCEPTION 'FALLA: tarjeta ajena con DETAIL %', v_detail;
  END IF;
  RAISE NOTICE 'OK no se guarda una tarjeta ajena (42501)';
END $$;

DO $$ BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3000000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 18, 'scores', '[5]'::jsonb, 'metadata', '{}'::jsonb));
  RAISE EXCEPTION 'FALLA: se guardó una fila sin ronda_libre_jugador_id';
EXCEPTION WHEN SQLSTATE '22023' THEN
  RAISE NOTICE 'OK sin ronda_libre_jugador_id no se guarda (22023)';
END $$;

DO $$ BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3000000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 18, 'scores', '[5]'::jsonb,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3000000-0000-4000-8000-0000000000ff')));
  RAISE EXCEPTION 'FALLA: se guardó la tarjeta de un jugador que no existe';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RAISE NOTICE 'OK un jugador que no existe da RONDA_NOT_FOUND (P0001)';
END $$;

-- ── Parte 2: el guardado ─────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_id uuid; v_fila public.historical_rounds;
BEGIN
  v_id := public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3000000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'course_id', NULL,
    'played_at', current_date, 'total_gross', 90, 'adjusted_gross', 88, 'scores', '[6, 5]'::jsonb,
    'par_per_hole', '[4, 4]'::jsonb, 'holes_played', 2, 'tee_color', 'Azul', 'privacy', 'private',
    'slope_rating', 130, 'course_rating', 71.5, 'diferencial', 12.3, 'formato_juego', 'stroke_play',
    'modo_juego', 'gross', 'match_result', NULL, 'team_name', NULL,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3000000-0000-4000-8000-000000000002', 'hoyos', '[1, 2]'::jsonb)));
  SELECT * INTO v_fila FROM public.historical_rounds WHERE id = v_id;
  IF v_fila.id IS NULL OR v_fila.user_id <> 'b3000000-0000-4000-8000-000000000002' OR v_fila.total_gross <> 90
     OR v_fila.adjusted_gross <> 88 OR v_fila.diferencial <> 12.3 OR v_fila.tee_color <> 'Azul'
     OR v_fila.import_source <> 'manual' OR v_fila.created_at IS NULL OR v_fila.excluded_from_handicap
     OR v_fila.metadata ->> 'ronda_libre_jugador_id' <> 'e3000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'FALLA: la fila guardada no es la esperada: %', row_to_json(v_fila);
  END IF;
  RAISE NOTICE 'OK el amigo guarda su tarjeta y la fila queda con los defaults de la tabla';
END $$;

DO $$ BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3000000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 2, 'scores', '[6, 5]'::jsonb,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3000000-0000-4000-8000-000000000002')));
  RAISE EXCEPTION 'FALLA: la misma tarjeta se guardó dos veces';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'OK la misma tarjeta dos veces da 23505 (duplicada)';
END $$;

RESET ROLE;

-- ── Parte 3: el cruce con el descarte, con dos sesiones ──────────────────────────────────────────────────────
-- Rondas confirmadas por otra sesión (la principal no confirma nada). CRUZA: el guardado llega primero.
-- CRUZB: el descarte llega primero.
SELECT extensions.dblink_connect('otra', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres');
SELECT extensions.dblink_exec('otra', $q$
  INSERT INTO auth.users (id, email) VALUES
    ('a3100000-0000-4000-8000-000000000001', 'creador-cruce@prueba.test'),
    ('b3100000-0000-4000-8000-000000000002', 'amigo-cruce@prueba.test');
  INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
    ('d3100000-0000-4000-8000-000000000001', 'CRUZA', 'Cancha', current_date,
     'a3100000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso'),
    ('d3100000-0000-4000-8000-000000000002', 'CRUZB', 'Cancha', current_date,
     'a3100000-0000-4000-8000-000000000001', 'stroke_play', 18, 'en_curso');
  INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap, scores) VALUES
    ('e3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001', 'Amigo',
     'b3100000-0000-4000-8000-000000000002', 20, '{"1": 6}'::jsonb),
    ('e3100000-0000-4000-8000-000000000002', 'd3100000-0000-4000-8000-000000000002', 'Amigo',
     'b3100000-0000-4000-8000-000000000002', 20, '{"1": 6}'::jsonb);
$q$);

-- 3a. La otra sesión (el amigo) guarda su tarjeta de CRUZA y todavía no confirma.
SELECT extensions.dblink_exec('otra', 'BEGIN');
SELECT extensions.dblink_exec('otra', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec('otra',
  $q$SET LOCAL request.jwt.claims = '{"sub":"b3100000-0000-4000-8000-000000000002","role":"authenticated"}'$q$);
SELECT * FROM extensions.dblink('otra', $q$
  SELECT public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3100000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 1, 'scores', '[6]'::jsonb,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3100000-0000-4000-8000-000000000001')))::text
$q$) AS t(id text);

-- El creador descarta CRUZA mientras tanto: espera al guardado (sin la función, no esperaba y la borraba).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL lock_timeout = '1s';
DO $$ BEGIN
  PERFORM public.descartar_ronda_libre('CRUZA');
  RAISE EXCEPTION 'FALLA: el descarte no esperó al guardado en curso';
EXCEPTION WHEN lock_not_available THEN
  RAISE NOTICE 'OK el descarte espera al guardado en curso (55P03 con lock_timeout)';
END $$;
RESET ROLE;

-- El guardado confirma: ahora el descarte ve la tarjeta y no borra.
SELECT extensions.dblink_exec('otra', 'COMMIT');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE v_detail text;
BEGIN
  PERFORM public.descartar_ronda_libre('CRUZA');
  RAISE EXCEPTION 'FALLA: el descarte borró una ronda con una tarjeta recién guardada';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  IF v_detail IS DISTINCT FROM 'ronda con tarjetas guardadas' THEN
    RAISE EXCEPTION 'FALLA: descarte tras el guardado con DETAIL %', v_detail;
  END IF;
  RAISE NOTICE 'OK confirmado el guardado, el descarte rechaza (P0003 ronda con tarjetas guardadas)';
END $$;

-- 3b. El creador descarta CRUZB sin confirmar (esta transacción termina en ROLLBACK) y el amigo intenta guardar.
SELECT public.descartar_ronda_libre('CRUZB');
RESET ROLE;
SELECT extensions.dblink_exec('otra', 'BEGIN');
SELECT extensions.dblink_exec('otra', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec('otra',
  $q$SET LOCAL request.jwt.claims = '{"sub":"b3100000-0000-4000-8000-000000000002","role":"authenticated"}'$q$);
SELECT extensions.dblink_exec('otra', $q$SET LOCAL lock_timeout = '1s'$q$);
DO $$
DECLARE v_estado text; v_error text;
BEGIN
  v_estado := extensions.dblink_exec('otra', $q$
    SELECT public.guardar_tarjeta_ronda_libre(jsonb_build_object(
      'user_id', 'b3100000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
      'holes_played', 1, 'scores', '[6]'::jsonb,
      'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3100000-0000-4000-8000-000000000002')))
  $q$, false);
  v_error := extensions.dblink_error_message('otra');
  IF v_estado <> 'ERROR' OR v_error NOT ILIKE '%lock timeout%' THEN
    RAISE EXCEPTION 'FALLA: el guardado no esperó al descarte en curso (estado %, error %)', v_estado, v_error;
  END IF;
  RAISE NOTICE 'OK el guardado espera al descarte en curso (lock timeout)';
END $$;
SELECT extensions.dblink_exec('otra', 'ROLLBACK');

-- Fin de la transacción principal: deshace las partes 1 y 2 y suelta CRUZB (que sigue ahí).
ROLLBACK;

-- 3c. Con CRUZB ya borrada de verdad (descarte confirmado por el creador en la otra sesión), el guardado no deja
-- una fila huérfana: RONDA_NOT_FOUND.
SELECT extensions.dblink_exec('otra', 'BEGIN');
SELECT extensions.dblink_exec('otra', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec('otra',
  $q$SET LOCAL request.jwt.claims = '{"sub":"a3100000-0000-4000-8000-000000000001","role":"authenticated"}'$q$);
SELECT * FROM extensions.dblink('otra', $q$SELECT public.descartar_ronda_libre('CRUZB')::text$q$) AS t(r text);
SELECT extensions.dblink_exec('otra', 'COMMIT');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b3100000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  PERFORM public.guardar_tarjeta_ronda_libre(jsonb_build_object(
    'user_id', 'b3100000-0000-4000-8000-000000000002', 'course_name', 'Cancha', 'played_at', current_date,
    'holes_played', 1, 'scores', '[6]'::jsonb,
    'metadata', jsonb_build_object('ronda_libre_jugador_id', 'e3100000-0000-4000-8000-000000000002')));
  RAISE EXCEPTION 'FALLA: se guardó la tarjeta de una ronda descartada';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RAISE NOTICE 'OK con la ronda descartada el guardado da RONDA_NOT_FOUND (P0001)';
END $$;
ROLLBACK;

-- ── Limpieza de lo que confirmó la otra sesión ───────────────────────────────────────────────────────────────
SELECT extensions.dblink_exec('otra', $q$
  DELETE FROM public.historical_rounds WHERE metadata ->> 'ronda_libre_jugador_id' LIKE 'e3100000-%';
  DELETE FROM public.rondas_libres WHERE id IN ('d3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000002');
  DELETE FROM auth.users WHERE id IN ('a3100000-0000-4000-8000-000000000001', 'b3100000-0000-4000-8000-000000000002');
$q$);
SELECT extensions.dblink_disconnect('otra');
DROP EXTENSION dblink;
