-- Pruebas SQL del Skins en la ronda libre (migración 20261125100000) con roles reales. Ver timba-libre.sql.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'organiza@prueba.test'),
  ('e0000000-0000-4000-8000-000000000002', 'ajeno@prueba.test'),
  ('e0000000-0000-4000-8000-000000000003', 'jugador@prueba.test');
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
  ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000002', 'Invitado normal', NULL),
  -- El caso real del campeonato: un jugador con cuenta, que no es probador, anota su propia tarjeta.
  ('e2000000-0000-4000-8000-000000000004', 'e1000000-0000-4000-8000-000000000001', 'Jugador', 'e0000000-0000-4000-8000-000000000003');

-- ── Esquema ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  INSERT INTO public.rondas_libres (codigo, course_name, fecha, creador_id, formato_juego)
  VALUES ('SKINS9', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000001', 'skins');
  RAISE EXCEPTION 'FALLA: un skins sin reglas_juego pasó el CHECK';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK esquema: skins sin reglas_juego -> CHECK';
END $$;
-- Control positivo: la misma fila con stroke_play sí entra (lo de abajo es el CHECK del formato, no otra columna).
DO $$ BEGIN
  INSERT INTO public.historical_rounds (user_id, course_name, played_at, holes_played, formato_juego)
  VALUES ('e0000000-0000-4000-8000-000000000001', 'Cancha', current_date, 18, 'stroke_play');
  RAISE NOTICE 'OK esquema: historical_rounds acepta la misma fila con stroke_play';
END $$;
DO $$ BEGIN
  INSERT INTO public.historical_rounds (user_id, course_name, played_at, holes_played, formato_juego)
  VALUES ('e0000000-0000-4000-8000-000000000001', 'Cancha', current_date, 18, 'skins');
  RAISE EXCEPTION 'FALLA: historical_rounds aceptó una ronda de skins';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK esquema: historical_rounds no acepta skins -> CHECK';
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
  PERFORM public.marcar_retiro_ronda_libre('SKINS1', 'e2000000-0000-4000-8000-000000000002', 10);
  RAISE NOTICE 'OK retiros: marcar_retiro_ronda_libre acepta un skins';
END $$;
-- authenticated no lee ronda_libre_puntitos (a propósito, ver timba-libre.sql): la marca se comprueba como postgres.
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_puntitos WHERE ronda_id = 'e1000000-0000-4000-8000-000000000001'
                 AND jugador_id = 'e2000000-0000-4000-8000-000000000001' AND hoyo = 3 AND puntito_id = 'sandy') THEN
    RAISE EXCEPTION 'FALLA: la marca del punto especial no quedó guardada';
  END IF;
  RAISE NOTICE 'OK puntos especiales: marcar_puntito_ronda_libre acepta un skins';
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';

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

-- La base garantiza «nunca conviven» aunque la escritura no pase por la RPC (el creador tiene UPDATE directo): CHECK.
DO $$ BEGIN
  -- El invitado tiene X en el 1 (arriba): golpes directos en el 1 no entran.
  UPDATE public.ronda_libre_jugadores SET scores = COALESCE(scores, '{}'::jsonb) || '{"1":5}'
  WHERE id = 'e2000000-0000-4000-8000-000000000002';
  RAISE EXCEPTION 'FALLA: un UPDATE directo dejó golpes y X en el mismo hoyo';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK: golpes directos sobre una X -> 23514';
END $$;
-- Desde 20261125140000 authenticated no escribe la X directo (solo por la RPC): 42501. El CHECK sigue cuidando a quien
-- sí puede (funciones definer, service_role): sus casos corren como postgres.
DO $$ BEGIN
  UPDATE public.ronda_libre_jugadores SET fuera_del_hoyo = '{"7":true}'
  WHERE id = 'e2000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FALLA: authenticated escribió la X directo';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK authenticated: X directa -> 42501';
END $$;
RESET ROLE;
DO $$ BEGIN
  -- El organizador tiene golpes en el 1: una X directa en el 1 no entra.
  UPDATE public.ronda_libre_jugadores SET fuera_del_hoyo = '{"1":true}'
  WHERE id = 'e2000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FALLA: un UPDATE directo dejó X sobre golpes';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK: X directa sobre golpes -> 23514';
END $$;
DO $$ BEGIN
  UPDATE public.ronda_libre_jugadores SET fuera_del_hoyo = '{"9":false}'
  WHERE id = 'e2000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FALLA: fuera_del_hoyo aceptó un valor distinto de true';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK: valor distinto de true -> 23514';
END $$;
DO $$ BEGIN
  UPDATE public.ronda_libre_jugadores SET fuera_del_hoyo = '{"28":true}'
  WHERE id = 'e2000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FALLA: fuera_del_hoyo aceptó el hoyo 28';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK: hoyo fuera de rango -> 23514';
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';

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

-- ── Jugador con cuenta, no probador: anota su propia X (el caso del campeonato) ─────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
DECLARE v jsonb; x jsonb;
BEGIN
  v := public.upsert_ronda_libre_scores('e2000000-0000-4000-8000-000000000004', 'SKINS1', '{"1":5,"2":"X"}');
  SELECT fuera_del_hoyo INTO x FROM public.ronda_libre_jugadores WHERE id = 'e2000000-0000-4000-8000-000000000004';
  IF v <> '{"1":5}'::jsonb OR x <> '{"2":true}'::jsonb THEN RAISE EXCEPTION 'FALLA: jugador: scores % fuera %', v, x; END IF;
  RAISE NOTICE 'OK jugador no probador: anota sus golpes y su X';
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
-- Un no probador no convierte su ronda normal en un skins (la guarda RESTRICTIVE de UPDATE cubre 'skins').
DO $$ BEGIN
  INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego)
  VALUES ('e1000000-0000-4000-8000-000000000003', 'AJENA1', 'Cancha', current_date, 'e0000000-0000-4000-8000-000000000002', 'stroke_play');
  RAISE NOTICE 'OK ajeno: crea su ronda normal';
END $$;
DO $$
DECLARE n int;
BEGIN
  -- Control positivo: el mismo UPDATE a otro formato sí pasa (el 42501 de abajo es la guarda del skins, no otra).
  UPDATE public.rondas_libres SET formato_juego = 'stableford' WHERE id = 'e1000000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: el ajeno no pudo cambiar el formato de su propia ronda (n=%)', n; END IF;
  RAISE NOTICE 'OK ajeno: cambia su ronda a stableford';
END $$;
DO $$
DECLARE n int;
BEGIN
  UPDATE public.rondas_libres SET formato_juego = 'skins', reglas_juego = (SELECT r FROM reglas)
  WHERE id = 'e1000000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'FALLA: la prueba no discrimina: el UPDATE no tocó la ronda propia'; END IF;
  RAISE EXCEPTION 'FALLA: un no probador pasó su ronda a skins';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK ajeno: UPDATE a skins -> 42501';
END $$;

-- ── service_role: el CHECK de la X corre en toda escritura de jugadores y exige EXECUTE de su función ────────
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre)
  VALUES ('e2000000-0000-4000-8000-000000000005', 'e1000000-0000-4000-8000-000000000002', 'Servidor');
  UPDATE public.ronda_libre_jugadores SET scores = '{"1":4}' WHERE id = 'e2000000-0000-4000-8000-000000000005';
  RAISE NOTICE 'OK service_role: inserta y actualiza jugadores con el CHECK de la X';
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
DO $$ BEGIN
  -- La vista en vivo pública suma fuera_del_hoyo al select: sin el grant de columna daría 42501.
  PERFORM fuera_del_hoyo FROM public.ronda_libre_jugadores LIMIT 1;
  RAISE NOTICE 'OK anon: lee fuera_del_hoyo';
END $$;

ROLLBACK;
