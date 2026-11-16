-- Pruebas SQL de 20261116120000_handicap_de_inscripcion con ROLES REALES, contra el Postgres desechable del check
-- `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige:
--   - ronda_libre_jugadores.handicap_de_inscripcion existe, boolean NOT NULL DEFAULT false, y anon la lee.
--   - El backfill (backfill_handicap_de_inscripcion, la misma función que corrió la migración) marca SOLO las filas
--     de tarjeta enlazadas desde tournament_group_players.jugador_ronda_id con handicap NOT NULL, y es idempotente.
--   - editar_handicap_inscrito: anon y authenticated no la ejecutan; service_role sí, y en el caso feliz escribe
--     players, la tarjeta y el equipo; con un esperado que no calza devuelve conflicto sin tocar nada; un equipo de
--     otro torneo o un jugador de otro torneo en p_base abortan sin escribir nada.
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado (psql con ON_ERROR_STOP corta ahí y
-- el job queda rojo). Todo corre en una transacción que termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
-- Torneo 1 (grupo G1 / ronda R1 / equipo E1): A (10.0, tarjeta JA con handicap) y B (20.0, tarjeta JB sin
-- handicap: lee el perfil). Torneo 2 (G2 / R2 / E2): C (5.0, tarjeta JC con handicap). JX: fila de una ronda
-- libre cualquiera con handicap, sin enlace a torneo.
INSERT INTO auth.users (id, email) VALUES
  ('a2000000-0000-4000-8000-000000000000', 'org-hdi@prueba.test'),
  ('a2000000-0000-4000-8000-000000000001', 'a-hdi@prueba.test'),
  ('a2000000-0000-4000-8000-000000000002', 'b-hdi@prueba.test'),
  ('a2000000-0000-4000-8000-000000000003', 'c-hdi@prueba.test');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start) VALUES
  ('b2000000-0000-4000-8000-000000000001', 'Torneo 1', 'hdi-torneo-1', 'a2000000-0000-4000-8000-000000000000', current_date),
  ('b2000000-0000-4000-8000-000000000002', 'Torneo 2', 'hdi-torneo-2', 'a2000000-0000-4000-8000-000000000000', current_date);

INSERT INTO public.players (id, tournament_id, user_id, handicap_at_registration, status) VALUES
  ('c2000000-0000-4000-8000-00000000000a', 'b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 10.0, 'approved'),
  ('c2000000-0000-4000-8000-00000000000b', 'b2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 20.0, 'approved'),
  ('c2000000-0000-4000-8000-00000000000c', 'b2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 5.0, 'approved');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'HDIR01', 'Cancha', current_date, 'a2000000-0000-4000-8000-000000000000', 'best_ball', 18, 'en_curso'),
  ('d2000000-0000-4000-8000-000000000002', 'HDIR02', 'Cancha', current_date, 'a2000000-0000-4000-8000-000000000000', 'best_ball', 18, 'en_curso'),
  ('d2000000-0000-4000-8000-000000000003', 'HDIR03', 'Cancha', current_date, 'a2000000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso');

INSERT INTO public.tournament_groups (id, tournament_id, name, ronda_libre_id) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'G1', 'd2000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'G2', 'd2000000-0000-4000-8000-000000000002');

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id, handicap) VALUES
  ('f2000000-0000-4000-8000-00000000000a', 'd2000000-0000-4000-8000-000000000001', 'A', 'a2000000-0000-4000-8000-000000000001', 10.0),
  ('f2000000-0000-4000-8000-00000000000b', 'd2000000-0000-4000-8000-000000000001', 'B', 'a2000000-0000-4000-8000-000000000002', NULL),
  ('f2000000-0000-4000-8000-00000000000c', 'd2000000-0000-4000-8000-000000000002', 'C', 'a2000000-0000-4000-8000-000000000003', 5.0),
  ('f2000000-0000-4000-8000-0000000000ff', 'd2000000-0000-4000-8000-000000000003', 'X', NULL, 7.0);

INSERT INTO public.tournament_group_players (group_id, player_id, jugador_ronda_id) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-00000000000a', 'f2000000-0000-4000-8000-00000000000a'),
  ('e2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-00000000000b', 'f2000000-0000-4000-8000-00000000000b'),
  ('e2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-00000000000c', 'f2000000-0000-4000-8000-00000000000c');

INSERT INTO public.ronda_equipos (id, ronda_id, nombre, handicap_equipo, handicap_equipo_juego) VALUES
  ('12000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'G1', 8.0, 8),
  ('12000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'G2', 3.0, 3);

-- ── Columna ──────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  SELECT data_type, is_nullable, column_default INTO c FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ronda_libre_jugadores' AND column_name = 'handicap_de_inscripcion';
  IF NOT FOUND THEN RAISE EXCEPTION 'FALLA: no existe ronda_libre_jugadores.handicap_de_inscripcion'; END IF;
  IF c.data_type <> 'boolean' OR c.is_nullable <> 'NO' OR c.column_default IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FALLA: handicap_de_inscripcion es % / nullable % / default %', c.data_type, c.is_nullable, c.column_default;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id::text LIKE 'f2000000-%' AND handicap_de_inscripcion) THEN
    RAISE EXCEPTION 'FALLA: una fila nueva nació con handicap_de_inscripcion = true';
  END IF;
  RAISE NOTICE 'OK handicap_de_inscripcion: boolean NOT NULL DEFAULT false';
END $$;

-- ── Backfill ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n integer; marcadas text;
BEGIN
  n := public.backfill_handicap_de_inscripcion();
  SELECT string_agg(nombre, ',' ORDER BY nombre) INTO marcadas FROM public.ronda_libre_jugadores
   WHERE id::text LIKE 'f2000000-%' AND handicap_de_inscripcion;
  -- Solo A y C: B está enlazada pero sin handicap (lee el perfil), X tiene handicap pero no es de un torneo.
  IF n <> 2 OR marcadas IS DISTINCT FROM 'A,C' THEN
    RAISE EXCEPTION 'FALLA: el backfill marcó % filas (%), esperaba 2 (A,C)', n, marcadas;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f2000000-0000-4000-8000-00000000000a' AND handicap <> 10.0) THEN
    RAISE EXCEPTION 'FALLA: el backfill tocó un handicap';
  END IF;
  n := public.backfill_handicap_de_inscripcion();
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el backfill no es idempotente (2ª pasada marcó %)', n; END IF;
  RAISE NOTICE 'OK el backfill marca solo las tarjetas de torneo con handicap, y es idempotente';
END $$;

-- ── Permisos del cliente ─────────────────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.ronda_libre_jugadores WHERE handicap_de_inscripcion;
  IF n < 2 THEN RAISE EXCEPTION 'FALLA: anon ve % filas marcadas, esperaba al menos 2', n; END IF;
  RAISE NOTICE 'OK anon lee handicap_de_inscripcion';
END $$;

DO $$ BEGIN
  PERFORM public.editar_handicap_inscrito('c2000000-0000-4000-8000-00000000000a', 10.0, 0, false, NULL, '[]', '[]');
  RAISE EXCEPTION 'FALLA: anon ejecutó editar_handicap_inscrito';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon: sin EXECUTE de editar_handicap_inscrito -> 42501';
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a2000000-0000-4000-8000-000000000000","role":"authenticated"}';

DO $$ BEGIN
  -- El organizador del torneo, con sesión: igual no puede (la autorización la hace la ruta del servidor).
  PERFORM public.editar_handicap_inscrito('c2000000-0000-4000-8000-00000000000a', 10.0, 0, false, NULL, '[]', '[]');
  RAISE EXCEPTION 'FALLA: authenticated ejecutó editar_handicap_inscrito';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK authenticated: sin EXECUTE de editar_handicap_inscrito -> 42501';
END $$;

DO $$ BEGIN
  PERFORM public.backfill_handicap_de_inscripcion();
  RAISE EXCEPTION 'FALLA: authenticated ejecutó backfill_handicap_de_inscripcion';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK authenticated: sin EXECUTE de backfill_handicap_de_inscripcion -> 42501';
END $$;

RESET ROLE;

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.backfill_handicap_de_inscripcion()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.backfill_handicap_de_inscripcion()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLA: anon o service_role tiene EXECUTE de backfill_handicap_de_inscripcion';
  END IF;
  RAISE NOTICE 'OK backfill_handicap_de_inscripcion: privada (solo postgres)';
END $$;

-- ── La RPC, como la llama la ruta (service_role) ─────────────────────────────────────────────────────────────
SET LOCAL ROLE service_role;

-- Caso feliz: B pasa de 20.0 a 18.5. Su tarjeta (JB) no tenía handicap ni marca: queda con 18.5 y la marca. A (10.0)
-- entró al cálculo del equipo (base); E1 se reescribe.
DO $$
DECLARE r jsonb; p numeric; t record; e record; a numeric;
BEGIN
  r := public.editar_handicap_inscrito(
    'c2000000-0000-4000-8000-00000000000b', 20.0, 18.5, true, 18.5,
    '[{"player_id": "c2000000-0000-4000-8000-00000000000a", "esperado": 10.0}]',
    '[{"equipo_id": "12000000-0000-4000-8000-000000000001", "handicap_equipo": 15.0, "handicap_equipo_juego": 15}]');
  IF r IS DISTINCT FROM '{"ok": true, "tarjetas": 1, "equipos": 1}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: el caso feliz devolvió %', r;
  END IF;
  SELECT handicap_at_registration INTO p FROM public.players WHERE id = 'c2000000-0000-4000-8000-00000000000b';
  SELECT handicap, handicap_de_inscripcion INTO t FROM public.ronda_libre_jugadores WHERE id = 'f2000000-0000-4000-8000-00000000000b';
  SELECT handicap_equipo, handicap_equipo_juego INTO e FROM public.ronda_equipos WHERE id = '12000000-0000-4000-8000-000000000001';
  SELECT handicap_at_registration INTO a FROM public.players WHERE id = 'c2000000-0000-4000-8000-00000000000a';
  IF p IS DISTINCT FROM 18.5 OR t.handicap IS DISTINCT FROM 18.5 OR NOT t.handicap_de_inscripcion
     OR e.handicap_equipo IS DISTINCT FROM 15.0 OR e.handicap_equipo_juego IS DISTINCT FROM 15 OR a IS DISTINCT FROM 10.0 THEN
    RAISE EXCEPTION 'FALLA: el caso feliz dejó player %, tarjeta % / %, equipo % / %, base %',
      p, t.handicap, t.handicap_de_inscripcion, e.handicap_equipo, e.handicap_equipo_juego, a;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f2000000-0000-4000-8000-00000000000a' AND handicap = 10.0)
     OR NOT EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = '12000000-0000-4000-8000-000000000002' AND handicap_equipo = 3.0) THEN
    RAISE EXCEPTION 'FALLA: el caso feliz tocó una tarjeta o un equipo ajeno';
  END IF;
  RAISE NOTICE 'OK editar_handicap_inscrito: escribe player, tarjeta (con la marca) y equipo';
END $$;

-- Sin tocar tarjeta (raw individual con cuenta): A pasa de 10.0 a 11.0 y su tarjeta JA queda igual.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.editar_handicap_inscrito('c2000000-0000-4000-8000-00000000000a', 10.0, 11.0, false, NULL, NULL, NULL);
  IF r IS DISTINCT FROM '{"ok": true, "tarjetas": 0, "equipos": 0}'::jsonb
     OR NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c2000000-0000-4000-8000-00000000000a' AND handicap_at_registration = 11.0)
     OR NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f2000000-0000-4000-8000-00000000000a' AND handicap = 10.0) THEN
    RAISE EXCEPTION 'FALLA: sin p_tocar_tarjeta devolvió % o no dejó solo players', r;
  END IF;
  RAISE NOTICE 'OK editar_handicap_inscrito sin p_tocar_tarjeta: solo players';
END $$;

-- Conflicto: el esperado del editado (o de la base) ya no es el actual -> nada se escribe.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.editar_handicap_inscrito(
    'c2000000-0000-4000-8000-00000000000b', 20.0, 30.0, true, 30.0, '[]',
    '[{"equipo_id": "12000000-0000-4000-8000-000000000001", "handicap_equipo": 25.0, "handicap_equipo_juego": 25}]');
  IF r IS DISTINCT FROM '{"ok": false, "motivo": "conflicto"}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: esperado viejo del editado devolvió %', r;
  END IF;
  r := public.editar_handicap_inscrito(
    'c2000000-0000-4000-8000-00000000000b', 18.5, 30.0, true, 30.0,
    '[{"player_id": "c2000000-0000-4000-8000-00000000000a", "esperado": 10.0}]',
    '[{"equipo_id": "12000000-0000-4000-8000-000000000001", "handicap_equipo": 25.0, "handicap_equipo_juego": 25}]');
  IF r IS DISTINCT FROM '{"ok": false, "motivo": "conflicto"}'::jsonb THEN
    RAISE EXCEPTION 'FALLA: esperado viejo de la base devolvió %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c2000000-0000-4000-8000-00000000000b' AND handicap_at_registration = 18.5)
     OR NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f2000000-0000-4000-8000-00000000000b' AND handicap = 18.5)
     OR NOT EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = '12000000-0000-4000-8000-000000000001' AND handicap_equipo = 15.0) THEN
    RAISE EXCEPTION 'FALLA: un conflicto escribió algo';
  END IF;
  RAISE NOTICE 'OK editar_handicap_inscrito: un esperado que no calza devuelve conflicto y no toca nada';
END $$;

-- Un equipo de otro torneo aborta TODO (también los UPDATE de players y de la tarjeta que ya había hecho).
DO $$ BEGIN
  PERFORM public.editar_handicap_inscrito(
    'c2000000-0000-4000-8000-00000000000b', 18.5, 40.0, true, 40.0, '[]',
    '[{"equipo_id": "12000000-0000-4000-8000-000000000002", "handicap_equipo": 1.0, "handicap_equipo_juego": 1}]');
  RAISE EXCEPTION 'FALLA: aceptó un equipo de otro torneo';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FALLA:%' THEN RAISE; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = 'c2000000-0000-4000-8000-00000000000b' AND handicap_at_registration = 18.5)
     OR NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores WHERE id = 'f2000000-0000-4000-8000-00000000000b' AND handicap = 18.5)
     OR NOT EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = '12000000-0000-4000-8000-000000000002' AND handicap_equipo = 3.0) THEN
    RAISE EXCEPTION 'FALLA: el equipo ajeno abortó pero dejó escrituras';
  END IF;
  RAISE NOTICE 'OK editar_handicap_inscrito: un equipo de otro torneo -> RAISE, sin escrituras';
END $$;

-- Un jugador de otro torneo en p_base aborta.
DO $$ BEGIN
  PERFORM public.editar_handicap_inscrito(
    'c2000000-0000-4000-8000-00000000000b', 18.5, 40.0, false, NULL,
    '[{"player_id": "c2000000-0000-4000-8000-00000000000c", "esperado": 5.0}]', '[]');
  RAISE EXCEPTION 'FALLA: aceptó en p_base un jugador de otro torneo';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FALLA:%' THEN RAISE; END IF;
  RAISE NOTICE 'OK editar_handicap_inscrito: p_base de otro torneo -> RAISE';
END $$;

-- p_base mal formada (falta "esperado") aborta: un null implícito no puede pasar por "no tenía índice".
DO $$ BEGIN
  PERFORM public.editar_handicap_inscrito(
    'c2000000-0000-4000-8000-00000000000b', 18.5, 40.0, false, NULL,
    '[{"player_id": "c2000000-0000-4000-8000-00000000000a"}]', '[]');
  RAISE EXCEPTION 'FALLA: aceptó una entrada de p_base sin "esperado"';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FALLA:%' THEN RAISE; END IF;
  RAISE NOTICE 'OK editar_handicap_inscrito: p_base mal formada -> RAISE';
END $$;

RESET ROLE;
ROLLBACK;
