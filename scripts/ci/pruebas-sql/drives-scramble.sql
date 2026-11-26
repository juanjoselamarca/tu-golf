-- Pruebas SQL de 20261125200000_drives_scramble_de_club (drives opcionales del scramble de club) con ROLES REALES
-- (anon / authenticated + su JWT), contra el Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con
-- todas las migraciones aplicadas.
--
-- Qué exige:
--   · columnas con sus defaults y CHECKs (una fila sin drives queda drive_jugadores NULL y drives '{}');
--   · anon lee drive_jugadores, drives y drives_minimo, y no ejecuta marcar_drive_equipo;
--   · marcar_drive_equipo tiene la MISMA autorización y estados que upsert_ronda_equipos_scores: el extraño no marca,
--     el anotador marca SU equipo y ningún otro, el creador no marca el equipo de otro celular, P0001/P0002/P0003 en
--     ronda inexistente, cerrada y demo; service_role pasa;
--   · valida el valor: equipo sin drives, hoyo fuera de la ronda e índice fuera del equipo → P0004;
--   · p_jugador NULL desmarca; los drives no tocan scores y los golpes no tocan drives;
--   · por la tabla nadie del cliente cambia drives (solo la RPC).
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a6d00000-0000-4000-8000-000000000001', 'creador-drives@prueba.test', '{"name":"Creador"}'),
  ('a6d00000-0000-4000-8000-000000000002', 'pedro-drives@prueba.test', '{"name":"Pedro"}'),
  ('a6d00000-0000-4000-8000-000000000004', 'extrano-drives@prueba.test', '{"name":"Extraño"}');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, modo_juego, holes, estado, admin_mode, drives_minimo, es_demo) VALUES
  -- Un celular por equipo, con drives.
  ('b6d00000-0000-4000-8000-000000000001', 'DRV001', 'Cancha', current_date,
   'a6d00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false, 4, false),
  -- Un celular para todos (admin_mode), 9 hoyos.
  ('b6d00000-0000-4000-8000-000000000002', 'DRV002', 'Cancha', current_date,
   'a6d00000-0000-4000-8000-000000000001', 'scramble', 'neto', 9, 'en_curso', true, 2, false),
  -- Cerrada.
  ('b6d00000-0000-4000-8000-000000000003', 'DRV003', 'Cancha', current_date,
   'a6d00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'finalizada', false, 4, false),
  -- Demo.
  ('b6d00000-0000-4000-8000-000000000004', 'DRV004', 'Cancha', current_date,
   'a6d00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false, 4, true);

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id) VALUES
  ('c6d00000-0000-4000-8000-000000000001', 'b6d00000-0000-4000-8000-000000000001', 'Creador',
   'a6d00000-0000-4000-8000-000000000001');

INSERT INTO public.ronda_equipos (id, ronda_id, nombre, handicap_equipo, handicap_equipo_juego, handicap_origen, anotador_user_id, drive_jugadores) VALUES
  ('f6d00000-0000-4000-8000-000000000011', 'b6d00000-0000-4000-8000-000000000001', 'Tu equipo', 8, 8, 'club',
   'a6d00000-0000-4000-8000-000000000001', ARRAY['Ana', 'Bea', 'Caro', 'Dani']),
  ('f6d00000-0000-4000-8000-000000000012', 'b6d00000-0000-4000-8000-000000000001', 'Los Tigres', 12, 12, 'club',
   NULL, ARRAY['Pedro', 'Juan', 'Diego', 'Tomás']),
  ('f6d00000-0000-4000-8000-000000000021', 'b6d00000-0000-4000-8000-000000000002', 'Admin', 8, 8, 'club',
   NULL, ARRAY['Uno', 'Dos', 'Tres', 'Cuatro']),
  ('f6d00000-0000-4000-8000-000000000031', 'b6d00000-0000-4000-8000-000000000003', 'Cerrada', 8, 8, 'club',
   NULL, ARRAY['Uno', 'Dos', 'Tres', 'Cuatro']),
  ('f6d00000-0000-4000-8000-000000000041', 'b6d00000-0000-4000-8000-000000000004', 'Demo', 8, 8, 'club',
   NULL, ARRAY['Uno', 'Dos', 'Tres', 'Cuatro']);

-- Un equipo como los de hoy: sin nombrar las columnas nuevas.
INSERT INTO public.ronda_equipos (id, ronda_id, nombre, handicap_equipo, handicap_equipo_juego, handicap_origen) VALUES
  ('f6d00000-0000-4000-8000-000000000013', 'b6d00000-0000-4000-8000-000000000001', 'Sin drives', 0, 0, 'club');

-- ── Esquema (como postgres) ──────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF (SELECT drive_jugadores IS NULL AND drives = '{}'::jsonb FROM public.ronda_equipos WHERE id = 'f6d00000-0000-4000-8000-000000000013') IS NOT TRUE THEN
    RAISE EXCEPTION 'FALLA: un equipo insertado como hoy no quedó sin drives (drive_jugadores NULL, drives {})';
  END IF;
  IF (SELECT drives_minimo FROM public.rondas_libres WHERE codigo = 'DRV001') IS DISTINCT FROM 4::smallint THEN
    RAISE EXCEPTION 'FALLA: drives_minimo no se guardó';
  END IF;
  RAISE NOTICE 'OK un equipo de hoy queda sin drives; drives_minimo se guarda';
END $$;

DO $$ BEGIN
  UPDATE public.ronda_equipos SET drives = '[1]'::jsonb WHERE id = 'f6d00000-0000-4000-8000-000000000013';
  RAISE EXCEPTION 'FALLA: drives aceptó algo que no es un objeto';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK drives solo objeto -> 23514';
END $$;

DO $$ BEGIN
  UPDATE public.ronda_equipos SET drive_jugadores = ARRAY['a', 'b', 'c', 'd', 'e'] WHERE id = 'f6d00000-0000-4000-8000-000000000013';
  RAISE EXCEPTION 'FALLA: drive_jugadores aceptó 5 jugadores';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK drive_jugadores hasta 4 -> 23514';
END $$;

DO $$ BEGIN
  UPDATE public.ronda_equipos SET drive_jugadores = ARRAY['a', NULL] WHERE id = 'f6d00000-0000-4000-8000-000000000013';
  RAISE EXCEPTION 'FALLA: drive_jugadores aceptó un NULL';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK drive_jugadores sin NULL -> 23514';
END $$;

DO $$ BEGIN
  UPDATE public.rondas_libres SET drives_minimo = 0 WHERE codigo = 'DRV001';
  RAISE EXCEPTION 'FALLA: drives_minimo aceptó 0';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK drives_minimo de 1 a 18 -> 23514';
END $$;

-- ── anon: lee las columnas, no marca ─────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$ BEGIN
  PERFORM drive_jugadores, drives FROM public.ronda_equipos LIMIT 1;
  PERFORM drives_minimo FROM public.rondas_libres LIMIT 1;
  RAISE NOTICE 'OK anon lee drive_jugadores, drives y drives_minimo';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000012', 'DRV001', 1, 0::smallint);
  RAISE EXCEPTION 'FALLA: anon ejecutó marcar_drive_equipo';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no marca drives -> 42501';
END $$;

RESET ROLE;

-- ── Extraño: no marca ningún equipo ──────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a6d00000-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000012', 'DRV001', 1, 0::smallint);
  RAISE EXCEPTION 'FALLA: un extraño marcó el drive de un equipo libre';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño no marca un equipo libre -> P0003';
END $$;

DO $$ BEGIN
  -- Valor inválido Y sin permiso: gana el permiso (no se le cuenta cómo es el equipo).
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 99, 9::smallint);
  RAISE EXCEPTION 'FALLA: un extraño llegó a la validación del valor';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño con valor inválido -> P0003 (el permiso va primero)';
END $$;

-- ── Creador: marca y desmarca su equipo y los libres; valida el valor ────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a6d00000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 1, 2::smallint);
  IF r IS DISTINCT FROM '{"1": 2}'::jsonb THEN RAISE EXCEPTION 'FALLA: marcar devolvió %', r; END IF;
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 1, 3::smallint);
  IF r IS DISTINCT FROM '{"1": 3}'::jsonb THEN RAISE EXCEPTION 'FALLA: cambiar el jugador devolvió %', r; END IF;
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 2, 0::smallint);
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 1, NULL);
  IF r IS DISTINCT FROM '{"2": 0}'::jsonb THEN RAISE EXCEPTION 'FALLA: desmarcar devolvió %', r; END IF;
  -- Desmarcar un hoyo sin drive no falla (idempotente: el reenvío de la cola puede repetirlo).
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 5, NULL);
  IF r IS DISTINCT FROM '{"2": 0}'::jsonb THEN RAISE EXCEPTION 'FALLA: desmarcar un hoyo vacío devolvió %', r; END IF;
  RAISE NOTICE 'OK el creador marca, cambia y desmarca el drive de su equipo';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000012', 'DRV001', 18, 1::smallint);
  IF r IS DISTINCT FROM '{"18": 1}'::jsonb THEN RAISE EXCEPTION 'FALLA: el creador no marcó un equipo libre: %', r; END IF;
  RAISE NOTICE 'OK el creador marca un equipo sin anotador (hoyo 18)';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 0, 0::smallint);
  RAISE EXCEPTION 'FALLA: aceptó el hoyo 0';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK hoyo 0 -> P0004';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 19, 0::smallint);
  RAISE EXCEPTION 'FALLA: aceptó el hoyo 19 en una ronda de 18';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK hoyo 19 en ronda de 18 -> P0004';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', NULL, 0::smallint);
  RAISE EXCEPTION 'FALLA: aceptó un hoyo NULL';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK hoyo NULL -> P0004';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 3, 4::smallint);
  RAISE EXCEPTION 'FALLA: aceptó el jugador 4 en un equipo de 4 (0..3)';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK jugador fuera del equipo -> P0004';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 3, (-1)::smallint);
  RAISE EXCEPTION 'FALLA: aceptó el jugador -1';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK jugador negativo -> P0004';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000013', 'DRV001', 3, 0::smallint);
  RAISE EXCEPTION 'FALLA: marcó el drive de un equipo que no anota drives';
EXCEPTION WHEN SQLSTATE 'P0004' THEN RAISE NOTICE 'OK equipo sin drives -> P0004';
END $$;

-- Estados: los de upsert_ronda_equipos_scores.
DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'NOEXIS', 1, 0::smallint);
  RAISE EXCEPTION 'FALLA: marcó con un código que no es el de la ronda';
EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE NOTICE 'OK código ajeno -> P0001';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000031', 'DRV003', 1, 0::smallint);
  RAISE EXCEPTION 'FALLA: marcó en una ronda cerrada';
EXCEPTION WHEN SQLSTATE 'P0002' THEN RAISE NOTICE 'OK ronda cerrada -> P0002';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000041', 'DRV004', 1, 0::smallint);
  RAISE EXCEPTION 'FALLA: marcó en una ronda demo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK ronda demo -> P0003';
END $$;

-- Un celular para todos (admin_mode), 9 hoyos: el creador marca; el hoyo 18 vale (una de 9 puede ir del 10 al 18).
DO $$
DECLARE r jsonb;
BEGIN
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000021', 'DRV002', 18, 3::smallint);
  IF r IS DISTINCT FROM '{"18": 3}'::jsonb THEN RAISE EXCEPTION 'FALLA: el creador no marcó en su ronda de un celular: %', r; END IF;
  RAISE NOTICE 'OK ronda de un celular (admin_mode): el creador marca';
END $$;

-- Por la tabla, no: ni el creador cambia drives sin la RPC.
DO $$ BEGIN
  UPDATE public.ronda_equipos SET drives = '{"7": 1}'::jsonb WHERE id = 'f6d00000-0000-4000-8000-000000000011';
  RAISE EXCEPTION 'FALLA: el creador cambió drives por la tabla';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK drives por la tabla -> 42501';
END $$;

-- Los golpes no tocan los drives (upsert_ronda_equipos_scores no cambió).
DO $$
DECLARE r jsonb;
BEGIN
  r := public.upsert_ronda_equipos_scores('f6d00000-0000-4000-8000-000000000011', 'DRV001', '{"2": 4}'::jsonb);
  IF r IS DISTINCT FROM '{"2": 4}'::jsonb THEN RAISE EXCEPTION 'FALLA: los golpes devolvieron %', r; END IF;
  IF (SELECT drives FROM public.ronda_equipos WHERE id = 'f6d00000-0000-4000-8000-000000000011') IS DISTINCT FROM '{"2": 0}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: anotar golpes cambió los drives';
  END IF;
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 2, 1::smallint);
  IF (SELECT scores FROM public.ronda_equipos WHERE id = 'f6d00000-0000-4000-8000-000000000011') IS DISTINCT FROM '{"2": 4}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: marcar un drive cambió los golpes';
  END IF;
  RAISE NOTICE 'OK golpes y drives no se tocan entre sí';
END $$;

-- ── Pedro reclama "Los Tigres": marca su equipo y ningún otro ───────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a6d00000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.reclamar_equipo_de_ronda('DRV001', 'f6d00000-0000-4000-8000-000000000012');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: Pedro no pudo reclamar: %', r; END IF;
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000012', 'DRV001', 1, 0::smallint);
  IF r IS DISTINCT FROM '{"1": 0, "18": 1}'::jsonb THEN RAISE EXCEPTION 'FALLA: el anotador no marcó su equipo: %', r; END IF;
  RAISE NOTICE 'OK el anotador marca su equipo';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000011', 'DRV001', 3, 0::smallint);
  RAISE EXCEPTION 'FALLA: el anotador de un equipo marcó otro';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK el anotador no marca otro equipo -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000013', 'DRV001', 3, 0::smallint);
  RAISE EXCEPTION 'FALLA: el anotador de un equipo marcó un equipo libre';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK el anotador no marca un equipo libre -> P0003';
END $$;

-- ── Creador: el equipo de otro celular no lo marca ──────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a6d00000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000012', 'DRV001', 2, 0::smallint);
  RAISE EXCEPTION 'FALLA: el creador marcó el equipo que anota otro celular';
EXCEPTION WHEN SQLSTATE 'P0003' THEN
  RAISE NOTICE 'OK el creador no marca el equipo de otro celular -> P0003';
END $$;

RESET ROLE;

-- ── service_role pasa ────────────────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.marcar_drive_equipo('f6d00000-0000-4000-8000-000000000012', 'DRV001', 2, 2::smallint);
  IF r IS DISTINCT FROM '{"1": 0, "2": 2, "18": 1}'::jsonb THEN RAISE EXCEPTION 'FALLA: service_role no marcó: %', r; END IF;
  RAISE NOTICE 'OK service_role marca';
END $$;

RESET ROLE;

ROLLBACK;
