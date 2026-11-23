-- Pruebas SQL de 20261123100000_scramble_equipos_de_club (scramble rápido: equipos de club y un celular por equipo)
-- con ROLES REALES (anon / authenticated + su JWT), contra el Postgres desechable del check `esquema`
-- (scripts/ci/esquema.mjs), con todas las migraciones aplicadas.
--
-- Qué exige (plan docs/superpowers/plans/2026-11-23-scramble-rapido.md, §1 y §2):
--   · un extraño no escribe ningún equipo; el anotador escribe SU equipo y ningún otro;
--   · un equipo tiene un solo anotador ('tomado' para el segundo) y una cuenta anota un solo equipo por ronda
--     ('ya_tienes_equipo'; el índice único lo sostiene también con dos reclamos simultáneos);
--   · el reclamo se rechaza en rondas de un celular (admin_mode), de torneo, no en curso y en equipos que no son de club;
--   · tras liberar, el ex anotador no escribe; liberan solo el creador y el propio anotador;
--   · el anotador no cierra la ronda (puede_anotar_ronda no cambió);
--   · anotador_nombre sale de profiles y no se falsifica; se borra al liberar y al eliminar la cuenta;
--   · anon lee handicap_origen y no lee quién anota.
--
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado (psql con ON_ERROR_STOP corta ahí y
-- el job queda rojo). Todo corre en una transacción que termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
-- Creador de las rondas, Pedro y Juan (segundos celulares), Extraño (cuenta sin nada que ver).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a5c00000-0000-4000-8000-000000000001', 'creador-club@prueba.test', '{"name":"Creador"}'),
  ('a5c00000-0000-4000-8000-000000000002', 'pedro-club@prueba.test', '{"name":"Pedro"}'),
  ('a5c00000-0000-4000-8000-000000000003', 'juan-club@prueba.test', '{"name":"Juan"}'),
  ('a5c00000-0000-4000-8000-000000000004', 'extrano-club@prueba.test', '{"name":"Extraño"}');

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, modo_juego, holes, estado, admin_mode) VALUES
  -- Un celular por equipo.
  ('b5c00000-0000-4000-8000-000000000001', 'CLUB01', 'Cancha', current_date,
   'a5c00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false),
  -- Un celular (toda ronda de equipos de hoy).
  ('b5c00000-0000-4000-8000-000000000002', 'CLUB02', 'Cancha', current_date,
   'a5c00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', true),
  -- Ronda de un torneo.
  ('b5c00000-0000-4000-8000-000000000003', 'CLUB03', 'Cancha', current_date,
   'a5c00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'en_curso', false),
  -- Ya cerrada.
  ('b5c00000-0000-4000-8000-000000000004', 'CLUB04', 'Cancha', current_date,
   'a5c00000-0000-4000-8000-000000000001', 'scramble', 'neto', 18, 'finalizada', false);

-- El creador es la única fila de jugador (su tarjeta individual queda vacía: el scramble anota en ronda_equipos).
INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, user_id) VALUES
  ('c5c00000-0000-4000-8000-000000000001', 'b5c00000-0000-4000-8000-000000000001', 'Creador',
   'a5c00000-0000-4000-8000-000000000001');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start, status) VALUES
  ('d5c00000-0000-4000-8000-000000000003', 'Torneo club', 'club-torneo', 'a5c00000-0000-4000-8000-000000000001', current_date, 'in_progress');
INSERT INTO public.tournament_groups (id, tournament_id, name, ronda_libre_id) VALUES
  ('e5c00000-0000-4000-8000-000000000003', 'd5c00000-0000-4000-8000-000000000003', 'G1', 'b5c00000-0000-4000-8000-000000000003');

-- Equipo 1 nace con el creador de anotador (lo que hará /api/ronda-libre/create) y un nombre falso: lo pisa el trigger.
INSERT INTO public.ronda_equipos (id, ronda_id, nombre, handicap_equipo, handicap_equipo_juego, handicap_origen, anotador_user_id, anotador_nombre) VALUES
  ('f5c00000-0000-4000-8000-000000000011', 'b5c00000-0000-4000-8000-000000000001', 'Tu equipo', 8, 8, 'club',
   'a5c00000-0000-4000-8000-000000000001', 'Nombre falso'),
  ('f5c00000-0000-4000-8000-000000000012', 'b5c00000-0000-4000-8000-000000000001', 'Los Tigres', 12, 12, 'club', NULL, NULL),
  ('f5c00000-0000-4000-8000-000000000013', 'b5c00000-0000-4000-8000-000000000001', 'Los Pumas', 0, 0, 'club', NULL, NULL),
  ('f5c00000-0000-4000-8000-000000000014', 'b5c00000-0000-4000-8000-000000000001', 'Calculado', NULL, NULL, 'calculado', NULL, NULL),
  ('f5c00000-0000-4000-8000-000000000021', 'b5c00000-0000-4000-8000-000000000002', 'Admin', 8, 8, 'club', NULL, NULL),
  ('f5c00000-0000-4000-8000-000000000031', 'b5c00000-0000-4000-8000-000000000003', 'Torneo', 8, 8, 'club', NULL, NULL),
  ('f5c00000-0000-4000-8000-000000000041', 'b5c00000-0000-4000-8000-000000000004', 'Cerrada', 8, 8, 'club', NULL, NULL);

-- ── Esquema (como postgres) ──────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF (SELECT anotador_nombre FROM public.ronda_equipos WHERE id = 'f5c00000-0000-4000-8000-000000000011') IS DISTINCT FROM 'Creador' THEN
    RAISE EXCEPTION 'FALLA: anotador_nombre no salió de profiles.name al insertar';
  END IF;
  RAISE NOTICE 'OK al insertar, anotador_nombre sale de profiles (el nombre falso no queda)';
END $$;

DO $$ BEGIN
  INSERT INTO public.ronda_equipos (ronda_id, nombre) VALUES ('b5c00000-0000-4000-8000-000000000002', 'Sin origen');
  IF (SELECT handicap_origen FROM public.ronda_equipos WHERE nombre = 'Sin origen') IS DISTINCT FROM 'calculado' THEN
    RAISE EXCEPTION 'FALLA: handicap_origen no toma ''calculado'' por defecto';
  END IF;
  RAISE NOTICE 'OK handicap_origen por defecto = calculado (los inserts de hoy no cambian)';
END $$;

DO $$ BEGIN
  UPDATE public.ronda_equipos SET handicap_origen = 'inventado' WHERE id = 'f5c00000-0000-4000-8000-000000000014';
  RAISE EXCEPTION 'FALLA: handicap_origen aceptó un valor fuera de calculado/club';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK handicap_origen solo calculado/club -> 23514';
END $$;

-- ── anon: lee el origen del hándicap, no quién anota ─────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

DO $$ BEGIN
  PERFORM handicap_origen FROM public.ronda_equipos LIMIT 1;
  RAISE NOTICE 'OK anon lee handicap_origen';
END $$;

DO $$ BEGIN
  PERFORM anotador_nombre FROM public.ronda_equipos LIMIT 1;
  RAISE EXCEPTION 'FALLA: anon lee anotador_nombre';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no lee anotador_nombre -> 42501';
END $$;

DO $$ BEGIN
  PERFORM anotador_user_id FROM public.ronda_equipos LIMIT 1;
  RAISE EXCEPTION 'FALLA: anon lee anotador_user_id';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no lee anotador_user_id -> 42501';
END $$;

DO $$ BEGIN
  PERFORM public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: anon ejecutó reclamar_equipo_de_ronda';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no reclama -> 42501';
END $$;

DO $$ BEGIN
  PERFORM public.liberar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000011');
  RAISE EXCEPTION 'FALLA: anon ejecutó liberar_equipo_de_ronda';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon no libera -> 42501';
END $$;

RESET ROLE;

-- ── Extraño: no escribe ningún equipo ────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000004","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000012', 'CLUB01', '{"1": 4}'::jsonb);
  RAISE EXCEPTION 'FALLA: un extraño escribió un equipo libre';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño no escribe un equipo libre -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000011', 'CLUB01', '{"1": 4}'::jsonb);
  RAISE EXCEPTION 'FALLA: un extraño escribió el equipo del creador';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK extraño no escribe un equipo con anotador -> P0003';
END $$;

-- ── Reclamo rechazado: ronda de un celular, de torneo, cerrada, equipo no de club, equipo de otra ronda ──────
DO $$ BEGIN
  PERFORM public.reclamar_equipo_de_ronda('CLUB02', 'f5c00000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FALLA: se reclamó un equipo de una ronda con admin_mode';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK reclamo en ronda de un celular (admin_mode) -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.reclamar_equipo_de_ronda('CLUB03', 'f5c00000-0000-4000-8000-000000000031');
  RAISE EXCEPTION 'FALLA: se reclamó un equipo de una ronda de torneo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK reclamo en ronda de torneo -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.reclamar_equipo_de_ronda('CLUB04', 'f5c00000-0000-4000-8000-000000000041');
  RAISE EXCEPTION 'FALLA: se reclamó un equipo de una ronda cerrada';
EXCEPTION WHEN SQLSTATE 'P0002' THEN RAISE NOTICE 'OK reclamo en ronda no en curso -> P0002';
END $$;

DO $$ BEGIN
  PERFORM public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000014');
  RAISE EXCEPTION 'FALLA: se reclamó un equipo que no es de club';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK reclamo de equipo no de club -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'FALLA: se reclamó un equipo con el código de otra ronda';
EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE NOTICE 'OK equipo de otra ronda bajo este código -> P0001';
END $$;

-- ── Pedro reclama "Los Tigres" ───────────────────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: Pedro no pudo reclamar un equipo libre: %', r; END IF;
  r := public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: reclamar de nuevo el propio equipo no es idempotente: %', r; END IF;
  IF (SELECT anotador_nombre FROM public.ronda_equipos WHERE id = 'f5c00000-0000-4000-8000-000000000012') IS DISTINCT FROM 'Pedro' THEN
    RAISE EXCEPTION 'FALLA: anotador_nombre no quedó en Pedro';
  END IF;
  RAISE NOTICE 'OK Pedro reclama un equipo libre (idempotente) y queda su nombre';
END $$;

-- Un equipo por cuenta.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000013');
  IF r->>'estado' IS DISTINCT FROM 'ya_tienes_equipo' OR r->>'equipo_id' IS DISTINCT FROM 'f5c00000-0000-4000-8000-000000000012' THEN
    RAISE EXCEPTION 'FALLA: Pedro tomó un segundo equipo: %', r;
  END IF;
  RAISE NOTICE 'OK Pedro no toma un segundo equipo -> ya_tienes_equipo';
END $$;

-- Escribe su equipo, ningún otro.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000012', 'CLUB01', '{"1": 4}'::jsonb);
  IF r IS DISTINCT FROM '{"1": 4}'::jsonb THEN RAISE EXCEPTION 'FALLA: el anotador no escribió su equipo: %', r; END IF;
  RAISE NOTICE 'OK el anotador escribe su equipo';
END $$;

DO $$ BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000013', 'CLUB01', '{"1": 3}'::jsonb);
  RAISE EXCEPTION 'FALLA: el anotador escribió un equipo libre que no es suyo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK el anotador no escribe un equipo libre -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000011', 'CLUB01', '{"1": 3}'::jsonb);
  RAISE EXCEPTION 'FALLA: el anotador escribió el equipo del creador';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK el anotador no escribe el equipo de otro anotador -> P0003';
END $$;

-- Ni directo en la tabla (RLS: solo el creador gestiona ronda_equipos).
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.ronda_equipos SET scores = '{"1": 1}'::jsonb WHERE id = 'f5c00000-0000-4000-8000-000000000013';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el anotador escribió otro equipo directo en la tabla (% filas)', n; END IF;
  RAISE NOTICE 'OK el anotador no escribe directo en la tabla -> 0 filas';
END $$;

-- No cierra la ronda (no es creador ni jugador; la tarjeta del creador está vacía).
DO $$ BEGIN
  PERFORM public.finalizar_ronda_libre('CLUB01');
  RAISE EXCEPTION 'FALLA: el anotador de un equipo cerró la ronda';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK el anotador no cierra la ronda -> P0003';
END $$;

-- No libera un equipo que no anota.
DO $$ BEGIN
  PERFORM public.liberar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000011');
  RAISE EXCEPTION 'FALLA: el anotador liberó el equipo de otro';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK el anotador no libera el equipo de otro -> P0003';
END $$;

-- ── Juan: el equipo de Pedro está tomado ─────────────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  IF r->>'estado' IS DISTINCT FROM 'tomado' OR r->>'anotador_nombre' IS DISTINCT FROM 'Pedro' THEN
    RAISE EXCEPTION 'FALLA: el segundo reclamo no vio el equipo tomado: %', r;
  END IF;
  IF (SELECT anotador_user_id FROM public.ronda_equipos WHERE id = 'f5c00000-0000-4000-8000-000000000012')
     IS DISTINCT FROM 'a5c00000-0000-4000-8000-000000000002'::uuid THEN
    RAISE EXCEPTION 'FALLA: el segundo reclamo le quitó el equipo a Pedro';
  END IF;
  RAISE NOTICE 'OK doble reclamo: un solo ganador; el segundo recibe tomado con el nombre';
END $$;

DO $$ BEGIN
  PERFORM public.liberar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: Juan liberó el equipo de Pedro';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK un tercero no libera un equipo ajeno -> P0003';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000013');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: Juan no pudo reclamar Los Pumas: %', r; END IF;
  RAISE NOTICE 'OK Juan reclama otro equipo libre';
END $$;

-- ── Un equipo por cuenta, también con dos reclamos simultáneos: lo sostiene el índice único (como postgres) ──
RESET ROLE;
DO $$ BEGIN
  UPDATE public.ronda_equipos SET anotador_user_id = 'a5c00000-0000-4000-8000-000000000002'
   WHERE id = 'f5c00000-0000-4000-8000-000000000013';
  RAISE EXCEPTION 'FALLA: una cuenta quedó anotando dos equipos de la misma ronda';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK índice único: una cuenta, un equipo por ronda -> 23505';
END $$;

-- ── Creador: escribe cualquier equipo (como hoy), no falsifica el nombre, libera ─────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000012', 'CLUB01', '{"2": 5}'::jsonb);
  IF r IS DISTINCT FROM '{"1": 4, "2": 5}'::jsonb THEN RAISE EXCEPTION 'FALLA: el creador perdió escribir los equipos: %', r; END IF;
  RAISE NOTICE 'OK el creador sigue escribiendo cualquier equipo (puede_anotar_ronda sin cambios)';
END $$;

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.ronda_equipos SET anotador_nombre = 'Otro' WHERE id = 'f5c00000-0000-4000-8000-000000000012';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 OR (SELECT anotador_nombre FROM public.ronda_equipos WHERE id = 'f5c00000-0000-4000-8000-000000000012') IS DISTINCT FROM 'Pedro' THEN
    RAISE EXCEPTION 'FALLA: el creador cambió el nombre del anotador a mano';
  END IF;
  RAISE NOTICE 'OK anotador_nombre no se falsifica desde la tabla (el trigger lo repone)';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.liberar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000013');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: el creador no pudo liberar: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = 'f5c00000-0000-4000-8000-000000000013'
             AND (anotador_user_id IS NOT NULL OR anotador_nombre IS NOT NULL)) THEN
    RAISE EXCEPTION 'FALLA: liberar dejó anotador o nombre';
  END IF;
  RAISE NOTICE 'OK el creador libera un equipo (anotador y nombre en NULL)';
END $$;

-- ── Juan, liberado por el creador, ya no escribe ─────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000003","role":"authenticated"}';

DO $$ BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000013', 'CLUB01', '{"3": 4}'::jsonb);
  RAISE EXCEPTION 'FALLA: el anotador liberado por el creador siguió escribiendo';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK tras liberar (creador), el ex anotador no escribe -> P0003';
END $$;

-- ── Pedro se libera a sí mismo y ya no escribe ───────────────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
DECLARE r jsonb;
BEGIN
  r := public.liberar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: el anotador no pudo liberarse: %', r; END IF;
  RAISE NOTICE 'OK el anotador libera su propio equipo';
END $$;

DO $$ BEGIN
  PERFORM public.upsert_ronda_equipos_scores('f5c00000-0000-4000-8000-000000000012', 'CLUB01', '{"3": 4}'::jsonb);
  RAISE EXCEPTION 'FALLA: el anotador siguió escribiendo después de liberarse';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK tras liberarse, el ex anotador no escribe -> P0003';
END $$;

DO $$ BEGIN
  PERFORM public.liberar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000012');
  RAISE EXCEPTION 'FALLA: un ex anotador liberó un equipo libre';
EXCEPTION WHEN SQLSTATE 'P0003' THEN RAISE NOTICE 'OK un ex anotador no libera de nuevo (ni el creador ni el anotador) -> P0003';
END $$;

-- ── Eliminar la cuenta del anotador libera el equipo y borra su nombre (como postgres) ───────────────────────
SET LOCAL request.jwt.claims = '{"sub":"a5c00000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$
DECLARE r jsonb;
BEGIN
  r := public.reclamar_equipo_de_ronda('CLUB01', 'f5c00000-0000-4000-8000-000000000013');
  IF r->>'estado' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'FALLA: Juan no pudo volver a reclamar: %', r; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN
  DELETE FROM auth.users WHERE id = 'a5c00000-0000-4000-8000-000000000003';
  IF EXISTS (SELECT 1 FROM public.ronda_equipos WHERE id = 'f5c00000-0000-4000-8000-000000000013'
             AND (anotador_user_id IS NOT NULL OR anotador_nombre IS NOT NULL)) THEN
    RAISE EXCEPTION 'FALLA: borrar la cuenta del anotador dejó su id o su nombre en el equipo';
  END IF;
  RAISE NOTICE 'OK borrar la cuenta del anotador libera el equipo y borra su nombre (FK SET NULL + trigger)';
END $$;

ROLLBACK;
