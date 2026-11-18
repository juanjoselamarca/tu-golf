-- Pruebas SQL de 20261121100000_orden_guardados_hole_scores (función guardar_hole_score), contra el Postgres
-- desechable del check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige (residual de #754: el jugador anota 5, corrige a 4, y el POST del 5 llega después):
--   · un guardado más viejo del mismo dispositivo y hoyo se descarta (aplicado = false) y deja la fila intacta;
--   · la misma secuencia repetida (reintento) también se descarta;
--   · otro dispositivo tiene su propia secuencia: no queda bloqueado por el primero;
--   · la marca es por hoyo;
--   · una clave ausente en p_fila deja la columna como estaba (el guardado de una stat no borra el neto);
--   · gross null (borrar el golpe) deja neto y puntos en null si vienen null;
--   · sólo service_role ejecuta la función y nadie del cliente toca hole_scores_orden;
--   · borrar la ronda borra sus marcas.
-- Lo llama /api/game como service_role, así que los casos corren con ese rol (también prueba el GRANT de la tabla).
--
-- La carrera real entre dos conexiones (el row lock de hole_scores_orden serializa los dos guardados) no se puede
-- escribir en un solo psql: se probó en golfersplus-test con dos conexiones (ver el PR #832).
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a7540000-0000-4000-8000-000000000000', 'organizador-754@prueba.test');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start, status, total_rounds) VALUES
  ('b7540000-0000-4000-8000-000000000001', 'Orden', 'orden-754', 'a7540000-0000-4000-8000-000000000000',
   current_date, 'in_progress', 1);

INSERT INTO public.players (id, tournament_id, player_name, handicap_at_registration, status, pending_user_id) VALUES
  ('c7540000-0000-4000-8000-000000000001', 'b7540000-0000-4000-8000-000000000001', 'J1', 10, 'approved', gen_random_uuid());

INSERT INTO public.rounds (id, tournament_id, player_id, round_number, status) VALUES
  ('d7540000-0000-4000-8000-000000000001', 'b7540000-0000-4000-8000-000000000001',
   'c7540000-0000-4000-8000-000000000001', 1, 'in_progress');

-- ── Permisos ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.guardar_hole_score(jsonb,bigint,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guardar_hole_score(jsonb,bigint,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: un rol cliente puede ejecutar guardar_hole_score';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.guardar_hole_score(jsonb,bigint,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: service_role no ejecuta guardar_hole_score';
  END IF;
  IF has_table_privilege('anon', 'public.hole_scores_orden', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.hole_scores_orden', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'FALLA: un rol cliente tiene privilegios sobre hole_scores_orden';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.hole_scores_orden', 'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'FALLA: service_role sin SELECT/INSERT/UPDATE en hole_scores_orden';
  END IF;
  RAISE NOTICE 'OK sólo service_role ejecuta la función; la tabla de marcas es privada';
END $$;

-- ── Orden (como service_role, igual que /api/game) ───────────────────────────────────────────────────────────
SET LOCAL ROLE service_role;

DO $$
DECLARE
  r constant uuid := 'd7540000-0000-4000-8000-000000000001';
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  b constant uuid := '00000000-0000-4000-8000-00000000000b';
  res jsonb;
  g int;
BEGIN
  -- El 4 (seq 2) llega primero; el 5 (seq 1) después.
  res := public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 1, 'par', 4, 'gross_score', 4,
    'net_score', 3, 'points', 3, 'source', 'manual_player', 'status', 'loaded'), 2, a);
  IF (res->>'aplicado')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALLA: seq 2 no se aplicó (%)', res; END IF;
  res := public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 1, 'par', 4, 'gross_score', 5,
    'net_score', 4, 'points', 2), 1, a);
  SELECT gross_score INTO g FROM public.hole_scores WHERE round_id = r AND hole_number = 1;
  IF (res->>'aplicado')::boolean IS NOT FALSE OR g <> 4 THEN
    RAISE EXCEPTION 'FALLA: el 5 viejo (seq 1) pisó al 4 (aplicado %, gross %)', res->>'aplicado', g;
  END IF;
  RAISE NOTICE 'OK fuera de orden: el guardado viejo se descarta y queda el 4';

  -- Misma secuencia (reintento): se descarta.
  res := public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 1, 'par', 4, 'gross_score', 6), 2, a);
  SELECT gross_score INTO g FROM public.hole_scores WHERE round_id = r AND hole_number = 1;
  IF (res->>'aplicado')::boolean IS NOT FALSE OR g <> 4 THEN
    RAISE EXCEPTION 'FALLA: la seq repetida se aplicó (aplicado %, gross %)', res->>'aplicado', g;
  END IF;
  RAISE NOTICE 'OK misma secuencia: se descarta';

  -- Otro dispositivo, seq 1: entra (gana el último en llegar entre dispositivos).
  res := public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 1, 'par', 4, 'gross_score', 6), 1, b);
  SELECT gross_score INTO g FROM public.hole_scores WHERE round_id = r AND hole_number = 1;
  IF (res->>'aplicado')::boolean IS NOT TRUE OR g <> 6 THEN
    RAISE EXCEPTION 'FALLA: el dispositivo B quedó bloqueado por A (aplicado %, gross %)', res->>'aplicado', g;
  END IF;
  -- Y A sigue con su propia secuencia.
  res := public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 1, 'par', 4, 'gross_score', 3), 3, a);
  SELECT gross_score INTO g FROM public.hole_scores WHERE round_id = r AND hole_number = 1;
  IF (res->>'aplicado')::boolean IS NOT TRUE OR g <> 3 THEN RAISE EXCEPTION 'FALLA: A seq 3 no se aplicó tras B'; END IF;
  RAISE NOTICE 'OK dos dispositivos: cada uno con su secuencia';

  -- La marca es por hoyo: hoyo 2 con seq 1 de A entra aunque A ya usó seq 3 en el hoyo 1.
  res := public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 2, 'par', 4, 'gross_score', 5), 1, a);
  IF (res->>'aplicado')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALLA: la marca no es por hoyo'; END IF;
  RAISE NOTICE 'OK la marca es por hoyo';
END $$;

DO $$
DECLARE
  r constant uuid := 'd7540000-0000-4000-8000-000000000001';
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  h public.hole_scores;
BEGIN
  -- Clave ausente conserva la columna: un guardado sin net_score/points (fallo de derivación) ni stats.
  PERFORM public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 3, 'par', 4, 'gross_score', 5,
    'net_score', 4, 'points', 2, 'putts', 2, 'fairway_hit', true), 1, a);
  PERFORM public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 3, 'par', 4, 'gross_score', 6), 2, a);
  SELECT * INTO h FROM public.hole_scores WHERE round_id = r AND hole_number = 3;
  IF h.gross_score <> 6 OR h.net_score IS DISTINCT FROM 4 OR h.points IS DISTINCT FROM 2
     OR h.putts IS DISTINCT FROM 2 OR h.fairway_hit IS NOT TRUE THEN
    RAISE EXCEPTION 'FALLA: una clave ausente borró la columna (%)', row_to_json(h);
  END IF;
  RAISE NOTICE 'OK clave ausente: la columna queda como estaba';

  -- Borrar el golpe: gross null con neto y puntos null.
  PERFORM public.guardar_hole_score(jsonb_build_object('round_id', r, 'hole_number', 3, 'par', 4,
    'gross_score', null, 'net_score', null, 'points', null), 3, a);
  SELECT * INTO h FROM public.hole_scores WHERE round_id = r AND hole_number = 3;
  IF h.gross_score IS NOT NULL OR h.net_score IS NOT NULL OR h.points IS NOT NULL OR h.putts IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALLA: borrar el golpe no dejó gross/neto/puntos en null o tocó putts (%)', row_to_json(h);
  END IF;
  RAISE NOTICE 'OK gross null: borra el golpe, neto y puntos; las stats quedan';
END $$;

-- ── Cascada (como postgres) ──────────────────────────────────────────────────────────────────────────────────
RESET ROLE;

DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.rounds WHERE id = 'd7540000-0000-4000-8000-000000000001';
  SELECT count(*) INTO n FROM public.hole_scores_orden WHERE round_id = 'd7540000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: borrar la ronda dejó % marcas', n; END IF;
  RAISE NOTICE 'OK borrar la ronda borra sus marcas';
END $$;

ROLLBACK;
