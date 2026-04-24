-- ============================================================
-- Golfers+ · Seed Demo Torneo — 40 jugadores en 10 grupos de 4
-- ============================================================
-- Complementa scripts/seed-demo-data.sql.
-- Requiere migrations 001 (base), 012 (tournament_groups), 028 (es_demo),
-- 029 (players.pending_user_id) aplicadas.
--
-- Crea:
--   · 40 jugadores invitados (pending_user_id) para demo-copa-chile-2026
--   · 10 tournament_groups con tee times escalonados cada 8 min desde 08:00
--   · 40 rounds (1 por jugador)
--   · hole_scores con mezcla de estados:
--     - 8 players finished (18 hoyos)
--     - 24 players en hoyo 13-17 (tabla activa)
--     - 8 players en hoyo 8-12 (acaban de empezar)
--
-- Scores correlacionados con HCP (deterministic via setseed):
--   · Cat A (HCP ≤10, 8 jugadores):   par -1 a par +1
--   · Cat B (HCP 10-18, 20 jugadores): par    a par +2
--   · Cat C (HCP ≥18, 12 jugadores):   par +1 a par +3
--
-- Idempotente: DELETE defensivo de seeds previos + ON CONFLICT DO NOTHING.
-- Re-ejecutable sin duplicar ni romper datos.
-- ============================================================

BEGIN;

-- ─── 0. Limpieza defensiva de seeds previos del torneo demo ─────────────
-- (incluye el viejo seed de 8 jugadores y cualquier re-ejecución previa)
DELETE FROM tournament_group_players
  WHERE group_id IN (
    SELECT id FROM tournament_groups
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
  );
DELETE FROM tournament_groups
  WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM hole_scores
  WHERE round_id IN (
    SELECT id FROM rounds
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
  );
DELETE FROM rounds
  WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM players
  WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND pending_user_id IS NOT NULL;

-- ─── 1. Seed determinístico ─────────────────────────────────────────────
-- Sin setseed, cada ejecución daría scores distintos.
-- Con setseed, el demo es reproducible en dev / staging / prod.
SELECT setseed(0.42);

-- ─── 2. Players, groups, rounds, hole_scores (todo en un DO block) ──────

DO $$
DECLARE
  v_tournament_id CONSTANT UUID := '00000000-0000-0000-0000-000000000001'::uuid;

  -- Par de Los Leones (18 hoyos, total 72)
  v_pars CONSTANT INT[] := ARRAY[4,5,3,4,3,4,4,3,5, 4,5,4,3,5,4,5,3,4];

  -- 40 nombres chilenos (mix género + apellidos diversos)
  v_names CONSTANT TEXT[] := ARRAY[
    -- Cat A (8, HCP ≤10)
    'Diego Silva',        'Juan Pérez',         'Martín Vargas',      'Andrés Castillo',
    'Cristóbal Ruiz',     'Felipe Ortega',      'Sebastián Muñoz',    'Tomás Navarro',
    -- Cat B (20, HCP 10-18)
    'Pablo Gómez',        'María González',     'Ignacio Tapia',      'Javiera Soto',
    'Rodrigo Lagos',      'Antonia Reyes',      'Francisco Bravo',    'Camila Paredes',
    'Luis Espinoza',      'Isidora Fuentes',    'Nicolás Moya',       'Paulina Jara',
    'Benjamín Cáceres',   'Fernanda Díaz',      'Joaquín Parra',      'Constanza Lira',
    'Vicente Salinas',    'Florencia Vega',     'Eduardo Olivares',   'Magdalena Ahumada',
    -- Cat C (12, HCP ≥18)
    'Catalina Rojas',     'Matías Herrera',     'Valentina Castro',   'Ricardo Alarcón',
    'Paula Mendoza',      'Gonzalo Acuña',      'Verónica Tobar',     'Alfonso Cornejo',
    'Daniela Zúñiga',     'Emilio Cortés',      'Carolina Prado',     'Manuel Leiva'
  ];

  -- Handicaps alineados 1:1 con v_names
  v_hcps CONSTANT NUMERIC[] := ARRAY[
    5.1, 8.3, 6.8, 7.3, 4.2, 8.9, 9.5, 10.0,
    10.5, 12.5, 11.0, 11.8, 12.2, 13.0, 13.7, 14.2, 14.8, 15.0, 15.3, 15.9,
    16.2, 16.7, 17.0, 17.3, 17.5, 17.8, 17.9, 18.0,
    18.7, 22.1, 19.2, 20.0, 21.3, 23.5, 24.0, 25.7, 26.8, 28.0, 29.2, 30.0
  ];

  v_player_id   UUID;
  v_round_id    UUID;
  v_group_id    UUID;
  v_hcp         NUMERIC;
  v_name        TEXT;
  v_tee         TEXT;
  v_thru        INT;
  v_par         INT;
  v_score       INT;
  v_offset_max  INT;
  v_offset_min  INT;
  v_status      TEXT;
  v_tee_time    TIMESTAMPTZ;
  i             INT;
  h             INT;
  g             INT;
BEGIN
  -- ─── 2a. Crear 40 players + rounds + hole_scores ─────────────────────
  FOR i IN 1..40 LOOP
    v_player_id := ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid;
    v_round_id  := ('00000000-0000-0000-0000-0000000003' || lpad(i::text, 2, '0'))::uuid;
    v_name      := v_names[i];
    v_hcp       := v_hcps[i];

    -- Tee por categoría: cat A azul, cat B blanco, cat C rojo
    v_tee := CASE
      WHEN v_hcp <= 10 THEN 'azul'
      WHEN v_hcp <= 18 THEN 'blanco'
      ELSE 'rojo'
    END;

    -- Mezcla de thru para que la tabla se vea viva:
    --   players 1-8   → 18 hoyos (finished, top del field)
    --   players 9-32  → 13-17 hoyos (grueso del field, tabla "en vivo")
    --   players 33-40 → 8-12 hoyos (rezagados)
    v_thru := CASE
      WHEN i <= 8  THEN 18
      WHEN i <= 32 THEN 13 + ((i * 7) % 5)
      ELSE              8  + ((i * 3) % 5)
    END;

    -- rounds_status_check: IN ('in_progress','closed','official')
    v_status := CASE WHEN v_thru = 18 THEN 'closed' ELSE 'in_progress' END;

    -- Rango de score por categoría (sobre el par del hoyo)
    IF v_hcp <= 10 THEN
      v_offset_min := -1; v_offset_max := 1;   -- birdie/par/bogey
    ELSIF v_hcp <= 18 THEN
      v_offset_min := 0;  v_offset_max := 2;   -- par/bogey/doble
    ELSE
      v_offset_min := 1;  v_offset_max := 3;   -- bogey a triple
    END IF;

    -- Insert player
    INSERT INTO players (
      id, tournament_id, user_id, pending_user_id,
      player_name, handicap_at_registration, status, tees
    ) VALUES (
      v_player_id, v_tournament_id, NULL, v_player_id,
      v_name, v_hcp, 'approved', v_tee
    ) ON CONFLICT (id) DO NOTHING;

    -- Insert round
    INSERT INTO rounds (
      id, tournament_id, player_id, status, round_number
    ) VALUES (
      v_round_id, v_tournament_id, v_player_id, v_status, 1
    ) ON CONFLICT (id) DO NOTHING;

    -- Insert hole scores (solo los hoyos jugados)
    FOR h IN 1..v_thru LOOP
      v_par := v_pars[h];
      v_score := v_par + v_offset_min + floor(random() * (v_offset_max - v_offset_min + 1))::int;
      IF v_score < 2 THEN v_score := 2; END IF;

      INSERT INTO hole_scores (
        round_id, hole_number, gross_score, par, source, status
      ) VALUES (
        v_round_id, h, v_score, v_par, 'manual_organizer', 'loaded'
      ) ON CONFLICT (round_id, hole_number) DO NOTHING;
    END LOOP;

    -- Totales de la ronda
    UPDATE rounds SET
      total_gross = (SELECT COALESCE(SUM(gross_score), 0) FROM hole_scores WHERE round_id = v_round_id),
      total_net   = (SELECT COALESCE(SUM(gross_score), 0) FROM hole_scores WHERE round_id = v_round_id)
    WHERE id = v_round_id;
  END LOOP;

  -- ─── 2b. Crear 10 tournament_groups con tee times escalonados ─────────
  -- Mezcla por grupo: asignación por offset de 10 para que cada grupo tenga
  -- 1 cat A + 1-2 cat B + 1 cat C (fourball real, no "top 4 juntos").
  --   grupo g toma jugadores (g), (g+10), (g+20), (g+30)
  -- Tee times: 08:00 base, + 8 min entre grupos (08:00 a 09:12).
  FOR g IN 1..10 LOOP
    v_group_id := ('00000000-0000-0000-0000-0000000004' || lpad(g::text, 2, '0'))::uuid;
    v_tee_time := date_trunc('day', NOW()) + interval '8 hours' + ((g - 1) * interval '8 minutes');

    INSERT INTO tournament_groups (
      id, tournament_id, name, tee_time, sort_order
    ) VALUES (
      v_group_id, v_tournament_id, 'Grupo ' || g, v_tee_time, g
    ) ON CONFLICT (id) DO NOTHING;

    FOR i IN 0..3 LOOP
      v_player_id := ('00000000-0000-0000-0000-0000000002' ||
                      lpad((g + i * 10)::text, 2, '0'))::uuid;
      INSERT INTO tournament_group_players (group_id, player_id)
      VALUES (v_group_id, v_player_id)
      ON CONFLICT (group_id, player_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─── 3. Verificación final ──────────────────────────────────────────────

DO $$
DECLARE
  v_players_count INT;
  v_rounds_count  INT;
  v_scores_count  INT;
  v_groups_count  INT;
  v_group_players INT;
  v_finished      INT;
  v_in_progress   INT;
BEGIN
  SELECT COUNT(*) INTO v_players_count FROM players
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND pending_user_id IS NOT NULL;
  SELECT COUNT(*) INTO v_rounds_count FROM rounds
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO v_scores_count FROM hole_scores hs
    JOIN rounds r ON r.id = hs.round_id
    WHERE r.tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO v_groups_count FROM tournament_groups
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO v_group_players FROM tournament_group_players tgp
    JOIN tournament_groups tg ON tg.id = tgp.group_id
    WHERE tg.tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO v_finished FROM rounds
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND status = 'closed';
  SELECT COUNT(*) INTO v_in_progress FROM rounds
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND status = 'in_progress';

  RAISE NOTICE 'Torneo demo — 40 jugadores poblados:';
  RAISE NOTICE '  players: %    rounds: %    hole_scores: %', v_players_count, v_rounds_count, v_scores_count;
  RAISE NOTICE '  groups: %     group_players: %', v_groups_count, v_group_players;
  RAISE NOTICE '  finished: %   in_progress: %', v_finished, v_in_progress;

  IF v_players_count <> 40 OR v_groups_count <> 10 OR v_group_players <> 40 THEN
    RAISE EXCEPTION 'Seed incompleto: esperaba 40 players / 10 groups / 40 group_players. Revisar log.';
  END IF;
END $$;

COMMIT;
