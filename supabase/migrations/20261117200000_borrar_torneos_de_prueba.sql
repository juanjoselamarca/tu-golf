-- Borra los 45 torneos de prueba de prod (decisión de Juanjo, 17-nov-2026: todos eran de prueba, incluidos los de
-- otros usuarios, los demo, los "Gate ·" y los E2E). Ningún torneo de la lista es real.
--
-- Qué borra, en una sola transacción (un DO es atómico: si algo falla, no queda nada a medias):
--   · los 45 torneos por id explícito, y en cascada (FK ON DELETE CASCADE): categories, flights, players, rounds,
--     hole_scores, score_audit_log, tournament_groups, tournament_group_players, tournament_prizes, tournament_rounds;
--   · los tournament_drafts que los publicaron (11, status 'created'; con SET NULL quedarían borradores "creados"
--     sin torneo) y en cascada sus colaboradores, eventos y tokens;
--   · 9 de las 11 tarjetas (rondas_libres) que el inicio del torneo creó por grupo: no tienen columna de torneo y
--     quedarían huérfanas (6 "en_curso"). Con ellas caen sus ronda_libre_jugadores y ronda_equipos.
-- Qué NO toca:
--   · historical_rounds (historial e índice): ninguna fila viene de estos torneos (0 con import_source 'tournament'
--     o metadata.tournament_round_id, 0 con metadata.ronda_libre_jugador_id de sus tarjetas; medido el 17-nov);
--   · las 2 tarjetas con jugadores con cuenta real distintos de Juanjo (TQ398BX y TSS5SVF): quedan como rondas
--     libres finalizadas hasta que Juanjo decida (decisión de producto pendiente);
--   · taiger_sessions: si alguna apunta a un torneo o tarjeta borrada, se desvincula (SET NULL), no se borra.
--
-- Guardas: si queda algo de la lista por borrar, aborta cuando hay más de 45 torneos, un torneo fuera de la lista o
-- uno creado desde el 17-nov-2026 (hora de Chile): un torneo real creado antes de aprobar `migraciones-prod` no se
-- toca nunca. Idempotente: corrida de nuevo (o en una base sin estos torneos, como la del check `esquema`) no hace
-- nada.
--
-- Respaldo previo (fuera del repo, es público): %USERPROFILE%\OneDrive\GolfersPlus-Respaldos-borrado-torneos\.
-- Rollback: supabase/migrations/rollback/20261117_borrar_torneos_de_prueba_rollback.sql

DO $$
DECLARE
  torneos uuid[] := ARRAY[
    'cadc5bb2-3bbe-4fc3-b05c-a88c55178126', -- 2026-03-13 draft · Test
    '2ca9be81-f5f5-4774-9d15-ee7e043ba6e0', -- 2026-03-14 draft · Copa demonio
    '349f7653-43b3-4eca-b7c1-54c480cffbaa', -- 2026-03-17 draft · A
    '09d3ee4a-fb8c-4666-a70b-846b7a9a2a1b', -- 2026-03-18 draft · Copa Golfers+ — Torneo Demo
    '2fc886db-42b7-4651-accf-976a5a59ca07', -- 2026-03-18 draft · Torneo Test — Stableford
    'e93a0e22-e506-4b8a-bca8-9424ca23d394', -- 2026-03-18 draft · Torneo Test — 9 Hoyos
    '0c2b7e80-1c3b-4061-ae0c-7d7832ebfd91', -- 2026-03-25 draft · Copa Test
    '0dd3a7a2-9e1f-4c1e-908a-43f41a7ebf91', -- 2026-03-30 draft · Copa Test
    '736837c2-d525-489f-bcbd-540df0b37dde', -- 2026-04-01 draft · Copa Test
    '1a844f29-bcdd-486b-a8d3-8e71410365f9', -- 2026-04-04 closed · Copa Leaderboard Test
    '79a1b7ac-d150-4dca-943c-c39f8644ba4a', -- 2026-04-04 closed · Copa Test Tabs
    'de4dc8b0-0d67-4d57-a603-4a82327482f6', -- 2026-04-09 draft · Copa test
    '702a2259-6e69-4500-8c0a-ae9493b0add7', -- 2026-04-20 in_progress · Copa cabros
    '00000000-0000-0000-0000-000000000001', -- 2026-04-22 in_progress · Copa Golfers+ Chile Demo
    '138eb381-484d-4733-91f2-0e6a081f8bb1', -- 2026-05-12 closed · a
    '771fc639-ba59-409f-ab5c-51cdcbf2c42b', -- 2026-05-12 draft · B
    '64afefdb-5de7-4bc7-89cf-290c05f41bb2', -- 2026-05-23 closed · Torneo Seed E2E
    '8007921c-9053-436d-9d9d-06f0865ac11c', -- 2026-05-25 open · LB OPEN 2026 PADRE E HIJO
    '90615e74-a710-4d75-bd90-fd00c4068e5b', -- 2026-05-27 draft · Padre e Hijo 2026
    '6306b2db-261d-4b94-a986-57aa4dc3f347', -- 2026-06-09 draft · COPA LB PADRE E HIJO 2026
    '0d374759-894a-4ebc-8fd5-1693a67ef109', -- 2026-07-20 open · LB OPPPP
    'bb75f4cc-e5ec-4422-8030-2ddd6716d1b0', -- 2026-08-02 closed · E2E Equipos best_ball
    'd59b426d-34b3-4ad7-8575-efbfd07a1091', -- 2026-08-04 draft · COPA LB PADRE E HIJO 2026
    'af9f2ef8-db84-4063-9294-250f4810bf24', -- 2026-08-31 closed · E2E Equipos best_ball
    '90daab7c-8128-4881-81bd-e676125396a9', -- 2026-09-01 closed · E2E Equipos scramble
    '43abef12-8b5f-4b7b-b838-f68693375fec', -- 2026-09-01 closed · E2E Equipos best_ball
    '45ae19e5-c070-46a7-8a63-e0e31a1a7370', -- 2026-09-01 closed · E2E Equipos scramble
    '8fcba579-f290-41d0-99c1-cf36bf27b6f3', -- 2026-09-02 draft · Lb op987
    '3fc214e7-9a41-4bc9-b65d-413b73aecffd', -- 2026-09-02 closed · E2E Equipos best_ball
    'ca67c1bb-93cf-4cbb-a809-d22019be46ae', -- 2026-09-04 closed · E2E Equipos best_ball
    '520cdac8-191a-49cc-be5a-697166fd62ab', -- 2026-09-07 closed · E2E Equipos scramble
    '01c22abd-c1de-4999-8d8c-f02efcbf424f', -- 2026-09-08 closed · E2E Equipos scramble
    'fb48b19c-60b3-48c8-9584-33c24a0cab4c', -- 2026-09-09 closed · E2E Equipos scramble
    '166e586b-bb8b-4e88-a5b4-e8c6cacee466', -- 2026-09-17 in_progress · Gate · Individual 9 hoyos (handicap 9h)
    '0964748d-eb70-451f-a244-f78bce8da25e', -- 2026-09-17 in_progress · Gate · Match Play 18 hoyos
    'e07e17a6-3f32-440c-8e77-d1550c6b5d2d', -- 2026-09-17 in_progress · Gate · Individual 18 hoyos (mixto)
    'fc99a65c-e780-4503-b69a-0b9e8fba0600', -- 2026-09-17 in_progress · Gate · Best Ball (equipos)
    'eefd4f96-0df5-4484-8f8c-6b23b31f8a1d', -- 2026-09-17 in_progress · Gate · Scramble (equipos)
    '1f865d71-d027-4d59-a1df-7d5732979269', -- 2026-09-17 in_progress · Gate · Foursome (equipos)
    '080192cf-61eb-408e-a92e-cd9b5da02bac', -- 2026-09-30 draft · [publish-draft.test] 1790766309446
    '5c17dd8a-ce51-447f-86a1-d272c18e11e9', -- 2026-09-30 draft · [publish-draft.test] 1790781239258
    '999facf0-3a83-46e1-a8cc-b687787bbaeb', -- 2026-10-01 draft · [publish-draft.test] 1790825017471 · carrera
    '728957a6-6d34-4d1d-9fd4-8fbdea62b662', -- 2026-10-04 draft · [publish-draft.test] 1791119504087 · carrera
    '388f387a-032f-4e06-bf15-c15e45741462', -- 2026-10-04 draft · [publish-draft.test] 1791119504087 · carrera
    '118a15e8-a099-482c-ab23-39f46e74445e'  -- 2026-11-16 open · COPA LB PADRE E HIJO 2026
  ]::uuid[];
  -- Tarjetas de grupo de esos torneos sin jugadores con cuenta real ajena a Juanjo (demo, test e invitados).
  tarjetas uuid[] := ARRAY[
    'cde606f7-7946-4941-8d78-644c51267831', -- TPZ5XBV · Copa cabros
    'cbadfdf9-7a11-4e41-a888-175b5bb432ff', -- TKPXKGW · Copa cabros
    'cb712b8d-64e4-4f02-aaec-09d036947be4', -- TGNJVW1 · a
    'b482bd91-d79b-4b0e-911f-267b26e04aa5', -- GATEB2LL1 · Gate · Best Ball
    'b4ec54c5-1389-4f90-89dd-940e592eb436', -- GATEB2LL2 · Gate · Best Ball
    '7a9aa084-e6a8-4a2a-9f57-5eaef32073b2', -- GATEB2LE1 · Gate · Scramble
    '2b67f11d-e7f6-43f5-ab66-683cc80909a1', -- GATEB2LE2 · Gate · Scramble
    '7a6ec4d9-127f-48c7-bb9b-b93244f9e071', -- GATEB2ME1 · Gate · Foursome
    '3e4f66b4-deac-4a61-82ae-fe3dfd56f1dd'  -- GATEB2ME2 · Gate · Foursome
  ]::uuid[];
  quedan int;
  n int;
BEGIN
  IF cardinality(torneos) <> 45 OR cardinality(tarjetas) <> 9 THEN
    RAISE EXCEPTION 'borrar_torneos_de_prueba: la lista trae % torneos y % tarjetas (se esperaban 45 y 9)',
      cardinality(torneos), cardinality(tarjetas);
  END IF;

  SELECT count(*) INTO quedan FROM public.tournaments WHERE id = ANY (torneos);

  IF quedan > 0 THEN
    SELECT count(*) INTO n FROM public.tournaments;
    IF n > 45 THEN
      RAISE EXCEPTION 'borrar_torneos_de_prueba: hay % torneos (máximo 45). Abortado sin borrar nada.', n;
    END IF;
    SELECT count(*) INTO n FROM public.tournaments WHERE NOT (id = ANY (torneos));
    IF n > 0 THEN
      RAISE EXCEPTION 'borrar_torneos_de_prueba: hay % torneo(s) fuera de la lista. Abortado sin borrar nada.', n;
    END IF;
    SELECT count(*) INTO n FROM public.tournaments WHERE created_at >= timestamptz '2026-11-17 00:00:00-03';
    IF n > 0 THEN
      RAISE EXCEPTION 'borrar_torneos_de_prueba: % torneo(s) creados desde el 17-nov-2026. Abortado sin borrar nada.', n;
    END IF;
  END IF;

  -- Conversaciones del coach: se desvinculan, nunca se borran (FK sin ON DELETE: bloquearían el borrado).
  UPDATE public.taiger_sessions SET tournament_id = NULL WHERE tournament_id = ANY (torneos);
  UPDATE public.taiger_sessions SET ronda_libre_id = NULL WHERE ronda_libre_id = ANY (tarjetas);

  -- Borradores que publicaron estos torneos (cascada: colaboradores, eventos, tokens).
  DELETE FROM public.tournament_drafts WHERE tournament_id = ANY (torneos) OR pending_tournament_id = ANY (torneos);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'borrar_torneos_de_prueba: % tournament_drafts', n;

  -- Los torneos (cascada: categorías, flights, inscritos, rondas, golpes, grupos, premios, rondas del torneo).
  -- Corre como postgres: las guardas de grupos fijos (#810) solo cortan a anon/authenticated.
  DELETE FROM public.tournaments WHERE id = ANY (torneos);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'borrar_torneos_de_prueba: % tournaments', n;

  -- Tarjetas de grupo, solo si ya ningún grupo de torneo las usa (cascada: jugadores, equipos y sus órdenes).
  DELETE FROM public.rondas_libres r
  WHERE r.id = ANY (tarjetas)
    AND NOT EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.ronda_libre_id = r.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'borrar_torneos_de_prueba: % rondas_libres', n;

  -- Verificación: no queda ninguno de la lista ni nada colgando de ellos.
  SELECT (SELECT count(*) FROM public.tournaments WHERE id = ANY (torneos))
       + (SELECT count(*) FROM public.players WHERE tournament_id = ANY (torneos))
       + (SELECT count(*) FROM public.rounds WHERE tournament_id = ANY (torneos))
       + (SELECT count(*) FROM public.tournament_groups WHERE tournament_id = ANY (torneos))
       + (SELECT count(*) FROM public.tournament_drafts WHERE tournament_id = ANY (torneos) OR pending_tournament_id = ANY (torneos))
       + (SELECT count(*) FROM public.rondas_libres WHERE id = ANY (tarjetas))
    INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'borrar_torneos_de_prueba: quedaron % filas de la lista tras borrar', n;
  END IF;
END
$$;
