-- Torneo demo nuevo para /demo (la tarjeta "Torneo demo" enlaza /torneo/demo-copa-chile-2026). Va en el mismo PR que
-- 20261117200000_borrar_torneos_de_prueba.sql y corre DESPUÉS: ese borrado se lleva el demo viejo (40 invitados,
-- "en curso" desde abril, sin cancha) y deja libre el slug. Juanjo, 17-nov-2026: demo limpio, ficticio y verosímil.
--
-- Qué crea (ids fijos 00000000-0000-4000-8000-00000d......):
--   · "Copa Golfers+ Chile", cerrado el sábado 14-nov-2026 en C.G. Las Brisas de Chicureo - El Valle (cancha real del
--     catálogo, tee azul varones: CR 71.9 / slope 116), stroke play neto 18 hoyos, hándicap WHS al 100 %;
--   · 12 jugadores inventados, sin cuenta (user_id null, invitado: pending_user_id = su propio id), 3 grupos de 4;
--   · una ronda cerrada por jugador con los 18 golpes. Los golpes se guardan como "sobre el par" y el par lo pone la
--     cancha: tarjeta y par nunca se contradicen. El neto, el podio y los puntos los deriva el motor desde los golpes
--     (build-from-legacy), como en cualquier torneo; rounds.total_net no se escribe.
--   Podio neto esperado: Cristóbal Vidal 68, Francisco Muñoz 70, Ignacio Fuentes 71. Bruto: Fuentes 73.
--
-- Cómo queda fuera de las listas de usuarios reales: es_demo = true (el scorer no deja anotar), ningún jugador tiene
-- cuenta (no aparece en "Jugando en" ni en "Mis torneos" de nadie) y lo organiza la cuenta ficticia
-- carlos-mendez@demo.golfers.plus (no aparece en "Organizando" de ninguna persona real). afecta_estadisticas = false.
--
-- Solo crea el demo donde existen la cuenta organizadora y la cancha (prod). En una base sin ellas (el Postgres
-- desechable del check `esquema`, la base de pruebas) no hace nada. Si la cuenta existe pero falta la cancha o su
-- tee, aborta: en prod sería un demo roto. Idempotente: si el demo ya existe, no hace nada.
--
-- Rollback: supabase/migrations/rollback/20261117_torneo_demo_rollback.sql

DO $$
DECLARE
  demo      uuid := '00000000-0000-4000-8000-00000d000000';
  cancha    uuid := 'f119ee22-39f6-46d2-a15a-dab20f186366'; -- C.G. Las Brisas De Chicureo - El Valle (VARONES)
  organizador uuid;
  nombre_cancha text;
  cr numeric;
  sl integer;
  j record;
  jugador uuid;
  ronda uuid;
  grupo uuid;
  n int;
BEGIN
  SELECT u.id INTO organizador FROM auth.users u
   WHERE u.email = 'carlos-mendez@demo.golfers.plus' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
  IF organizador IS NULL THEN
    RAISE NOTICE 'torneo_demo: no está la cuenta organizadora del demo (base sin datos de prod); no se crea.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tournaments WHERE id = demo) THEN
    RAISE NOTICE 'torneo_demo: el demo ya existe; nada que hacer.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE slug = 'demo-copa-chile-2026') THEN
    RAISE EXCEPTION 'torneo_demo: el slug demo-copa-chile-2026 sigue ocupado (¿no corrió el borrado de los torneos de prueba?)';
  END IF;

  SELECT c.nombre INTO nombre_cancha FROM public.courses c WHERE c.id = cancha;
  SELECT t.rating, t.slope INTO cr, sl FROM public.course_tees t WHERE t.course_id = cancha AND t.nombre = 'azul' AND t.genero = 'M';
  SELECT count(*) INTO n FROM public.course_holes h WHERE h.course_id = cancha AND h.numero BETWEEN 1 AND 18 AND h.par IN (3, 4, 5);
  IF nombre_cancha IS NULL OR cr IS NULL OR sl IS NULL OR n <> 18 THEN
    RAISE EXCEPTION 'torneo_demo: la cancha del demo no está completa (cancha %, tee azul %/%, % hoyos)', nombre_cancha, cr, sl, n;
  END IF;

  INSERT INTO public.tournaments (
    id, name, slug, organizer_id, course_id, course_name, date_start, date_end, format, formato_juego, modo_juego,
    hole_count, use_handicap, status, tees, afecta_estadisticas, total_rounds, es_demo, hcp_calc_mode, hcp_pct,
    course_rating, slope_rating, description
  ) VALUES (
    demo, 'Copa Golfers+ Chile', 'demo-copa-chile-2026', organizador, cancha, nombre_cancha, '2026-11-14', '2026-11-14',
    'stroke_play', 'stroke_play', 'neto', 18, true, 'closed', 'azul', false, 1, true, 'whs', 100, cr, sl,
    'Torneo de exhibición: stroke play neto a 18 hoyos con hándicap WHS, leaderboard oficial y podio.'
  );

  FOR n IN 1..3 LOOP
    INSERT INTO public.tournament_groups (id, tournament_id, name, tee_time, sort_order)
    VALUES (('00000000-0000-4000-8000-00000d0003' || lpad(n::text, 2, '0'))::uuid, demo, 'Grupo ' || n,
            timestamptz '2026-11-14 08:00:00-03' + (n - 1) * interval '10 minutes', n);
  END LOOP;

  -- nombre, índice, golpes sobre el par por hoyo (1..18). CH = course handicap en el tee azul (71.9 / 116, par 72).
  FOR j IN
    SELECT * FROM (VALUES
      (1,  'Ignacio Fuentes',   2.4,  ARRAY[0,-1,1,1,0,1,0,0,-1,0,0,0,1,0,-1,0,0,0]),  -- CH 2 · bruto 73 · neto 71
      (2,  'Matías Rojas',      4.1,  ARRAY[0,0,0,2,0,-1,1,0,0,1,0,-1,0,-1,0,3,1,0]),  -- CH 4 · bruto 77 · neto 73
      (3,  'Cristóbal Vidal',   5.8,  ARRAY[0,0,-1,0,0,-1,0,1,0,1,-1,0,-1,0,1,1,1,1]), -- CH 6 · bruto 74 · neto 68
      (4,  'Joaquín Soto',      7.3,  ARRAY[1,1,0,1,-1,-1,0,1,1,1,0,1,0,0,0,2,1,1]),   -- CH 7 · bruto 81 · neto 74
      (5,  'Sebastián Araya',   8.9,  ARRAY[0,0,1,2,0,0,0,1,0,2,-1,0,0,1,0,2,1,0]),    -- CH 9 · bruto 81 · neto 72
      (6,  'Nicolás Contreras', 10.2, ARRAY[1,1,0,1,0,0,1,2,1,1,-1,1,0,2,0,3,0,0]),    -- CH 10 · bruto 85 · neto 75
      (7,  'Francisco Muñoz',   11.6, ARRAY[1,0,1,0,0,0,2,0,1,1,1,0,-1,1,0,1,1,1]),    -- CH 12 · bruto 82 · neto 70
      (8,  'Vicente Herrera',   13.0, ARRAY[1,0,2,1,0,0,1,1,1,1,0,2,1,3,0,1,1,1]),     -- CH 13 · bruto 89 · neto 76
      (9,  'Rodrigo Pizarro',   14.7, ARRAY[1,1,1,2,0,0,2,1,1,1,2,0,0,0,0,1,1,2]),     -- CH 15 · bruto 88 · neto 73
      (10, 'Andrés Valdivia',   16.1, ARRAY[1,1,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,2]),     -- CH 16 · bruto 93 · neto 77
      (11, 'Felipe Carrasco',   18.4, ARRAY[1,1,2,1,1,1,1,3,1,2,1,0,0,2,2,1,0,1]),     -- CH 19 · bruto 93 · neto 74
      (12, 'Diego Navarro',     21.0, ARRAY[2,1,1,3,2,1,1,2,1,1,2,2,2,1,1,2,0,3])      -- CH 21 · bruto 100 · neto 79
    ) AS v(num, nombre, indice, sobre_par)
  LOOP
    jugador := ('00000000-0000-4000-8000-00000d0001' || lpad(j.num::text, 2, '0'))::uuid;
    ronda   := ('00000000-0000-4000-8000-00000d0002' || lpad(j.num::text, 2, '0'))::uuid;
    grupo   := ('00000000-0000-4000-8000-00000d0003' || lpad(((j.num - 1) / 4 + 1)::text, 2, '0'))::uuid;

    INSERT INTO public.players (id, tournament_id, user_id, pending_user_id, player_name, handicap_at_registration,
                                status, tees, genero, created_at)
    VALUES (jugador, demo, NULL, jugador, j.nombre, j.indice, 'approved', 'azul', 'M', timestamptz '2026-11-09 12:00:00-03');

    INSERT INTO public.tournament_group_players (group_id, player_id) VALUES (grupo, jugador);

    INSERT INTO public.rounds (id, tournament_id, player_id, status, total_gross, round_number, started_at, closed_at)
    SELECT ronda, demo, jugador, 'closed', sum(h.par + j.sobre_par[h.numero]), 1,
           timestamptz '2026-11-14 08:00:00-03' + ((j.num - 1) / 4) * interval '10 minutes',
           timestamptz '2026-11-14 12:40:00-03' + ((j.num - 1) / 4) * interval '10 minutes'
      FROM public.course_holes h WHERE h.course_id = cancha AND h.numero BETWEEN 1 AND 18;

    INSERT INTO public.hole_scores (round_id, hole_number, par, gross_score, source, status)
    SELECT ronda, h.numero, h.par, h.par + j.sobre_par[h.numero], 'manual_organizer', 'confirmed'
      FROM public.course_holes h WHERE h.course_id = cancha AND h.numero BETWEEN 1 AND 18;
  END LOOP;

  -- Verificación: el demo completo y, tras el borrado de los 45, es el único torneo.
  IF (SELECT count(*) FROM public.players WHERE tournament_id = demo) <> 12
     OR (SELECT count(*) FROM public.rounds WHERE tournament_id = demo AND status = 'closed') <> 12
     OR (SELECT count(*) FROM public.hole_scores s JOIN public.rounds r ON r.id = s.round_id WHERE r.tournament_id = demo) <> 216
     OR (SELECT count(*) FROM public.tournament_group_players gp JOIN public.tournament_groups g ON g.id = gp.group_id
          WHERE g.tournament_id = demo) <> 12 THEN
    RAISE EXCEPTION 'torneo_demo: el demo quedó incompleto';
  END IF;
  SELECT count(*) INTO n FROM public.tournaments;
  IF n <> 1 THEN
    RAISE EXCEPTION 'torneo_demo: tras el borrado debería quedar solo el demo y hay % torneos', n;
  END IF;
END
$$;
