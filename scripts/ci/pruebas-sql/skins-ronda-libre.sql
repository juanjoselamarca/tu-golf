-- Pruebas SQL del Skins en la ronda libre (migración 20261125100000) con roles reales. Ver timba-libre.sql.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'organiza@prueba.test'),
  ('e0000000-0000-4000-8000-000000000002', 'ajeno@prueba.test');
INSERT INTO public.timba_probadores (user_id) VALUES ('e0000000-0000-4000-8000-000000000001');
CREATE TEMP TABLE reglas AS SELECT '{"config":{"version":1,"modo":"neto","hcpPct":75,"empateUltimoHoyo":"repartir",
  "validacion":false,"pozoPorJugador":10000,"puntitos":[{"id":"sandy","tipo":"sandy"}]},"jugadorIds":[]}'::jsonb AS r;
GRANT SELECT ON reglas TO anon, authenticated;

-- Un skins en curso del organizador (él y un invitado sin cuenta) y una ronda normal con un invitado.
INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, reglas_juego, holes, estado) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'SKINS1', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000001',
   'skins', (SELECT r FROM reglas), 18, 'en_curso'),
  ('e1000000-0000-4000-8000-000000000002', 'NORMAL', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000001',
   'stroke_play', NULL, 18, 'en_curso');
INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Organiza', 'e0000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'Invitado', NULL),
  ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002', 'Invitado normal', NULL);

-- ── Esquema ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego)
  VALUES ('SKINS9', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000001', 'skins');
  RAISE EXCEPTION 'FALLA: un skins sin reglas_juego pasó el CHECK';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK esquema: skins sin reglas_juego -> CHECK';
END $$;
DO $$ BEGIN
  INSERT INTO public.historical_rounds (user_id, course_name, fecha, formato_juego)
  VALUES ('e0000000-0000-4000-8000-000000000001', 'Cancha', current_date, 'skins');
  RAISE EXCEPTION 'FALLA: historical_rounds aceptó una ronda de skins';
EXCEPTION
  WHEN check_violation THEN RAISE NOTICE 'OK esquema: historical_rounds no acepta skins';
  WHEN not_null_violation THEN RAISE NOTICE 'OK esquema: historical_rounds no acepta skins (otra columna obligatoria cortó antes; el CHECK se mira abajo)';
END $$;
DO $$ BEGIN
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'historical_rounds_formato_check')) LIKE '%skins%' THEN
    RAISE EXCEPTION 'FALLA: el CHECK de historical_rounds incluye skins';
  END IF;
  RAISE NOTICE 'OK esquema: el CHECK de historical_rounds sigue sin skins';
END $$;

-- ── Organizador (probador, no admin): crea un skins, anota golpes y X ─────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $$
DECLARE v jsonb; x jsonb;
BEGIN
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
  VALUES ('SKINS2', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000001', 'skins', (SELECT r FROM reglas));
  RAISE NOTICE 'OK organizador: crea un skins';

  v := public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"1":4,"2":5}');
  IF v <> '{"1":4,"2":5}'::jsonb THEN RAISE EXCEPTION 'FALLA: golpes %', v; END IF;

  -- X en el 2 (borra sus golpes) y golpes en el 3, en el mismo delta.
  v := public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"2":"X","3":3}');
  SELECT fuera_del_hoyo INTO x FROM public.ronda_libre_jugadores WHERE id = 'e2000000-0000-4000-8000-000000000001';
  IF v <> '{"1":4,"3":3}'::jsonb OR x <> '{"2":true}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: X no reemplazó los golpes: scores % fuera %', v, x;
  END IF;
  RAISE NOTICE 'OK X: borra los golpes de su hoyo y devuelve solo golpes';

  -- Golpes en el 2: borran la X.
  v := public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"2":6}');
  SELECT fuera_del_hoyo INTO x FROM public.ronda_libre_jugadores WHERE id = 'e2000000-0000-4000-8000-000000000001';
  IF v <> '{"1":4,"2":6,"3":3}'::jsonb OR x <> '{}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: los golpes no borraron la X: scores % fuera %', v, x;
  END IF;
  RAISE NOTICE 'OK X: anotar golpes la borra';

  -- El organizador anota la tarjeta de su invitado sin cuenta.
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000002', 'SKINS1', '{"1":"X"}');
  RAISE NOTICE 'OK organizador: anota la X de su invitado';

  -- Marca un punto especial de las reglas del skins con la misma RPC de la Timba.
  PERFORM public.marcar_puntito_ronda_libre('SKINS1', 'e2000000-0000-4000-8000-000000000001', 3, 'sandy', true);
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'e2000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'FALLA: fila perdida';
  END IF;
  RAISE NOTICE 'OK puntos especiales: marcar_puntito_ronda_libre acepta un skins';
  PERFORM public.marcar_retiro_ronda_libre('SKINS1', 'e2000000-0000-4000-8000-000000000002', 10);
  RAISE NOTICE 'OK retiros: marcar_retiro_ronda_libre acepta un skins';
END $$;

-- Validación de la X: claves inválidas, otros strings, y X fuera de skins.
DO $$ BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"28":"X"}');
  RAISE EXCEPTION 'FALLA: X en el hoyo 28';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK X: hoyo fuera de rango -> P0004';
END $$;
DO $$ BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"01":"X"}');
  RAISE EXCEPTION 'FALLA: X con clave no canónica';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK X: clave no canónica -> P0004';
END $$;
DO $$ BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"4":"x"}');
  RAISE EXCEPTION 'FALLA: otro string pasó';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK X: un string que no es "X" -> P0004';
END $$;
DO $$ BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000003', 'NORMAL', '{"1":"X","2":4}');
  RAISE EXCEPTION 'FALLA: X en una ronda que no es skins';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK X: fuera de skins -> P0004 (delta entero rechazado)';
END $$;
DO $$ BEGIN
  IF (SELECT scores FROM public.ronda_libre_jugadores WHERE id = 'e2000000-0000-4000-8000-000000000003') ? '2' THEN
    RAISE EXCEPTION 'FALLA: el delta rechazado escribió golpes';
  END IF;
  RAISE NOTICE 'OK X: el rechazo no deja escritura a medias';
END $$;

-- Secuencia por dispositivo: una X vieja que llega tarde no pisa golpes más nuevos.
DO $$
DECLARE v jsonb; x jsonb;
BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"5":4}', 20, 'e9000000-0000-4000-8000-000000000001');
  v := public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000001', 'SKINS1', '{"5":"X"}', 19, 'e9000000-0000-4000-8000-000000000001');
  SELECT fuera_del_hoyo INTO x FROM public.ronda_libre_jugadores WHERE id = 'e2000000-0000-4000-8000-000000000001';
  IF NOT (v ? '5') OR x ? '5' THEN RAISE EXCEPTION 'FALLA: la X vieja pisó: scores % fuera %', v, x; END IF;
  RAISE NOTICE 'OK orden: una X con secuencia vieja no se aplica';
END $$;

-- ── Ajeno (ni probador ni de la ronda) ─────────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego, reglas_juego)
  VALUES ('SKINS3', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000002', 'skins', (SELECT r FROM reglas));
  RAISE EXCEPTION 'FALLA: un no probador creó un skins';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK ajeno: INSERT skins -> 42501';
END $$;
DO $$ BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000002', 'SKINS1', '{"2":4}');
  RAISE EXCEPTION 'FALLA: un ajeno anotó al invitado de un skins';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK ajeno: tarjeta del invitado de un skins -> P0003';
END $$;
DO $$ BEGIN
  PERFORM 1 FROM public.ronda_libre_jugadores WHERE fuera_del_hoyo ? '1';
  RAISE NOTICE 'OK authenticated: lee fuera_del_hoyo';
END $$;

-- ── anon ───────────────────────────────────────────────────────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$ BEGIN
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000002', 'SKINS1', '{"2":"X"}');
  RAISE EXCEPTION 'FALLA: anon anotó al invitado de un skins';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK anon: invitado de un skins -> P0003';
END $$;
DO $$ BEGIN
  -- Fuera de la Timba y el Skins, la tarjeta de un invitado sigue abierta con el código (sin cambios).
  PERFORM public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000003', 'NORMAL', '{"3":5}');
  RAISE NOTICE 'OK anon: invitado de una ronda normal, como antes';
END $$;

ROLLBACK;
