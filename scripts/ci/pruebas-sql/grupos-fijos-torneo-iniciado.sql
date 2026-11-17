-- Pruebas SQL de 20261117120000_grupos_fijos_torneo_iniciado con ROLES REALES (authenticated + su JWT), contra el
-- Postgres desechable del check `esquema` (scripts/ci/esquema.mjs), con todas las migraciones aplicadas (#810).
--
-- Qué exige:
--   · antes del inicio el organizador arma sus grupos como siempre (mover, sacar, borrar grupo, borrar inscrito);
--   · con el torneo iniciado, desde el cliente no puede mover ni sacar a nadie de un grupo, ni borrar un grupo con
--     tarjeta o jugadores, ni cambiarle la tarjeta, ni borrar un inscrito; sí puede editar nombre y horario;
--   · una pestaña vieja (torneo leído como "open") tampoco puede si algún grupo ya tiene tarjeta;
--   · service_role (inicio, cancelar, admin) sigue pudiendo todo.
-- Cada caso es un DO que lanza una excepción si el resultado no es el esperado. Todo termina en ROLLBACK.

BEGIN;

-- ── Datos (como postgres) ────────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a8100000-0000-4000-8000-000000000000', 'organizador-810@prueba.test');

INSERT INTO public.tournaments (id, name, slug, organizer_id, date_start, status) VALUES
  -- Sin empezar: grupos sin tarjeta.
  ('b8100000-0000-4000-8000-000000000001', 'Abierto', 'gf-abierto', 'a8100000-0000-4000-8000-000000000000', current_date, 'open'),
  -- En juego: grupos con tarjeta y jugadores enlazados.
  ('b8100000-0000-4000-8000-000000000002', 'En juego', 'gf-en-juego', 'a8100000-0000-4000-8000-000000000000', current_date, 'in_progress');

INSERT INTO public.players (id, tournament_id, player_name, handicap_at_registration, status, pending_user_id) VALUES
  ('c8100000-0000-4000-8000-00000000000a', 'b8100000-0000-4000-8000-000000000001', 'A1', 10, 'approved', gen_random_uuid()),
  ('c8100000-0000-4000-8000-00000000000b', 'b8100000-0000-4000-8000-000000000001', 'A2', 12, 'approved', gen_random_uuid()),
  ('c8100000-0000-4000-8000-00000000000c', 'b8100000-0000-4000-8000-000000000001', 'A3', 14, 'approved', gen_random_uuid()),
  ('c8100000-0000-4000-8000-00000000001a', 'b8100000-0000-4000-8000-000000000002', 'J1', 10, 'approved', gen_random_uuid()),
  ('c8100000-0000-4000-8000-00000000001b', 'b8100000-0000-4000-8000-000000000002', 'J2', 12, 'approved', gen_random_uuid()),
  ('c8100000-0000-4000-8000-00000000001c', 'b8100000-0000-4000-8000-000000000002', 'J3', 14, 'approved', gen_random_uuid());

INSERT INTO public.rondas_libres (id, codigo, course_name, fecha, creador_id, formato_juego, holes, estado) VALUES
  ('d8100000-0000-4000-8000-000000000001', 'GF8101', 'Cancha', current_date,
   'a8100000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso'),
  ('d8100000-0000-4000-8000-000000000002', 'GF8102', 'Cancha', current_date,
   'a8100000-0000-4000-8000-000000000000', 'stroke_play', 18, 'en_curso');

INSERT INTO public.ronda_libre_jugadores (id, ronda_id, nombre, handicap, scores) VALUES
  ('f8100000-0000-4000-8000-00000000001a', 'd8100000-0000-4000-8000-000000000001', 'J1', 10, '{"1": 4}'::jsonb),
  ('f8100000-0000-4000-8000-00000000001b', 'd8100000-0000-4000-8000-000000000001', 'J2', 12, '{"1": 5}'::jsonb),
  ('f8100000-0000-4000-8000-00000000001c', 'd8100000-0000-4000-8000-000000000002', 'J3', 14, '{"1": 6}'::jsonb);

INSERT INTO public.tournament_groups (id, tournament_id, name, ronda_libre_id) VALUES
  ('e8100000-0000-4000-8000-000000000001', 'b8100000-0000-4000-8000-000000000001', 'Abierto G1', NULL),
  ('e8100000-0000-4000-8000-000000000002', 'b8100000-0000-4000-8000-000000000001', 'Abierto G2', NULL),
  ('e8100000-0000-4000-8000-000000000011', 'b8100000-0000-4000-8000-000000000002', 'Juego G1', 'd8100000-0000-4000-8000-000000000001'),
  ('e8100000-0000-4000-8000-000000000012', 'b8100000-0000-4000-8000-000000000002', 'Juego G2', 'd8100000-0000-4000-8000-000000000002'),
  -- Creado después del inicio, vacío y sin tarjeta: se puede borrar.
  ('e8100000-0000-4000-8000-000000000013', 'b8100000-0000-4000-8000-000000000002', 'Juego vacío', NULL);

INSERT INTO public.tournament_group_players (group_id, player_id, jugador_ronda_id) VALUES
  ('e8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-00000000000a', NULL),
  ('e8100000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-00000000000b', NULL),
  ('e8100000-0000-4000-8000-000000000002', 'c8100000-0000-4000-8000-00000000000c', NULL),
  ('e8100000-0000-4000-8000-000000000011', 'c8100000-0000-4000-8000-00000000001a', 'f8100000-0000-4000-8000-00000000001a'),
  ('e8100000-0000-4000-8000-000000000011', 'c8100000-0000-4000-8000-00000000001b', 'f8100000-0000-4000-8000-00000000001b'),
  ('e8100000-0000-4000-8000-000000000012', 'c8100000-0000-4000-8000-00000000001c', 'f8100000-0000-4000-8000-00000000001c');

-- ── El organizador, desde el cliente ─────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000000","role":"authenticated"}';

-- Antes del inicio: todo como siempre.
DO $$
DECLARE n integer;
BEGIN
  -- Mover A1 de G1 a G2 (assignPlayerToGroup = DELETE + INSERT).
  DELETE FROM public.tournament_group_players WHERE player_id = 'c8100000-0000-4000-8000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: antes del inicio no pudo sacar a A1 de su grupo (% filas)', n; END IF;
  INSERT INTO public.tournament_group_players (group_id, player_id)
    VALUES ('e8100000-0000-4000-8000-000000000002', 'c8100000-0000-4000-8000-00000000000a');
  -- Borrar un grupo con jugadores y una inscripción.
  DELETE FROM public.tournament_groups WHERE id = 'e8100000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: antes del inicio no pudo borrar un grupo (% filas)', n; END IF;
  DELETE FROM public.players WHERE id = 'c8100000-0000-4000-8000-00000000000c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: antes del inicio no pudo eliminar una inscripción (% filas)', n; END IF;
  RAISE NOTICE 'OK antes del inicio el organizador mueve, borra grupos y elimina inscripciones';
END $$;

-- En juego: cada intento de romper el enlace termina en error y no escribe nada.
DO $$
DECLARE
  intentos text[] := ARRAY[
    $q$DELETE FROM public.tournament_group_players WHERE player_id = 'c8100000-0000-4000-8000-00000000001a'$q$,
    $q$INSERT INTO public.tournament_group_players (group_id, player_id) VALUES ('e8100000-0000-4000-8000-000000000012', 'c8100000-0000-4000-8000-00000000001a')$q$,
    $q$INSERT INTO public.tournament_group_players (group_id, player_id) VALUES ('e8100000-0000-4000-8000-000000000013', 'c8100000-0000-4000-8000-00000000001a')$q$,
    $q$UPDATE public.tournament_group_players SET group_id = 'e8100000-0000-4000-8000-000000000012' WHERE player_id = 'c8100000-0000-4000-8000-00000000001b'$q$,
    $q$UPDATE public.tournament_group_players SET jugador_ronda_id = NULL WHERE player_id = 'c8100000-0000-4000-8000-00000000001b'$q$,
    $q$DELETE FROM public.tournament_groups WHERE id = 'e8100000-0000-4000-8000-000000000011'$q$,
    $q$UPDATE public.tournament_groups SET ronda_libre_id = NULL WHERE id = 'e8100000-0000-4000-8000-000000000012'$q$,
    $q$DELETE FROM public.players WHERE id = 'c8100000-0000-4000-8000-00000000001c'$q$
  ];
  q text;
  bloqueado boolean;
BEGIN
  FOREACH q IN ARRAY intentos LOOP
    bloqueado := false;
    BEGIN
      EXECUTE q;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'El torneo ya empezó%' THEN RAISE; END IF;
      bloqueado := true;
    END;
    IF NOT bloqueado THEN RAISE EXCEPTION 'FALLA: en juego el cliente pudo: %', q; END IF;
  END LOOP;
  RAISE NOTICE 'OK en juego el cliente no mueve, saca, desenlaza ni borra (% intentos)', array_length(intentos, 1);
END $$;

-- En juego: lo que no rompe nada sigue andando.
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.tournament_groups SET name = 'Juego G1 bis', tee_time = now()
   WHERE id = 'e8100000-0000-4000-8000-000000000011';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: en juego no pudo editar nombre y horario (% filas)', n; END IF;
  DELETE FROM public.tournament_groups WHERE id = 'e8100000-0000-4000-8000-000000000013';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: en juego no pudo borrar un grupo vacío sin tarjeta (% filas)', n; END IF;
  RAISE NOTICE 'OK en juego se editan nombre/horario y se borra un grupo vacío sin tarjeta';
END $$;

-- El enlace quedó intacto.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.tournament_group_players
   WHERE group_id IN ('e8100000-0000-4000-8000-000000000011', 'e8100000-0000-4000-8000-000000000012')
     AND jugador_ronda_id IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'FALLA: se perdió el enlace inscripción-tarjeta (% de 3)', n; END IF;
  RAISE NOTICE 'OK los 3 inscritos en juego siguen enlazados a su tarjeta';
END $$;

-- ── Pestaña vieja: el torneo todavía dice "open" pero un grupo ya tiene tarjeta ──────────────────────────────
RESET ROLE;
UPDATE public.tournaments SET status = 'open' WHERE id = 'b8100000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a8100000-0000-4000-8000-000000000000","role":"authenticated"}';

DO $$
DECLARE bloqueado boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.tournament_group_players WHERE player_id = 'c8100000-0000-4000-8000-00000000001a';
  EXCEPTION WHEN raise_exception THEN
    bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'FALLA: con un grupo con tarjeta el cliente sacó a un jugador'; END IF;
  RAISE NOTICE 'OK un grupo con tarjeta fija los grupos aunque el torneo diga "open"';
END $$;

-- ── service_role (inicio, cancelar torneo, admin): exento ────────────────────────────────────────────────────
RESET ROLE;
UPDATE public.tournaments SET status = 'in_progress' WHERE id = 'b8100000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.tournament_group_players SET jugador_ronda_id = NULL
   WHERE player_id = 'c8100000-0000-4000-8000-00000000001c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: service_role no pudo desenlazar (rollback del inicio) (% filas)', n; END IF;
  DELETE FROM public.tournament_group_players
   WHERE group_id IN (SELECT id FROM public.tournament_groups WHERE tournament_id = 'b8100000-0000-4000-8000-000000000002');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'FALLA: service_role no pudo cancelar el torneo (% filas)', n; END IF;
  RAISE NOTICE 'OK service_role sigue pudiendo deshacer el inicio y cancelar';
END $$;

RESET ROLE;
ROLLBACK;
