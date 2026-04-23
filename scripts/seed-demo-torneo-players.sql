-- ============================================================
-- Golfers+ — Seed Demo Torneo Players
-- ============================================================
-- Complementa scripts/seed-demo-data.sql.
-- Requiere migration 029_players_pending_user_id.sql aplicada primero.
--
-- Crea 8 jugadores invitados (pending_user_id) para el torneo
-- demo-copa-chile-2026, cada uno con 1 round en curso + scores
-- parciales en 12/18 hoyos.
--
-- Idempotente: ON CONFLICT DO NOTHING en todos los INSERTs.
-- ============================================================

-- ─── 1. Players (8 jugadores con pending_user_id) ──────────────────────
-- Mismos UUIDs / nombres / handicaps que los jugadores de la ronda libre
-- DEMO01 para coherencia visual entre ambos demos.

INSERT INTO players (id, tournament_id, user_id, pending_user_id, player_name, handicap_at_registration, status, tees)
VALUES
  ('00000000-0000-0000-0000-000000000201'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000201'::uuid, 'Juan Pérez', 8.3, 'approved', 'blanco'),
  ('00000000-0000-0000-0000-000000000202'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000202'::uuid, 'María González', 12.5, 'approved', 'blanco'),
  ('00000000-0000-0000-0000-000000000203'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000203'::uuid, 'Diego Silva', 5.1, 'approved', 'azul'),
  ('00000000-0000-0000-0000-000000000204'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000204'::uuid, 'Catalina Rojas', 18.7, 'approved', 'rojo'),
  ('00000000-0000-0000-0000-000000000205'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000205'::uuid, 'Pedro Fuentes', 9.8, 'approved', 'blanco'),
  ('00000000-0000-0000-0000-000000000206'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000206'::uuid, 'Francisca Morales', 14.2, 'approved', 'rojo'),
  ('00000000-0000-0000-0000-000000000207'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000207'::uuid, 'Matías Herrera', 22.1, 'approved', 'blanco'),
  ('00000000-0000-0000-0000-000000000208'::uuid, '00000000-0000-0000-0000-000000000001'::uuid,
   NULL, '00000000-0000-0000-0000-000000000208'::uuid, 'Valentina Castro', 11.0, 'approved', 'blanco')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Rounds (1 round en curso por jugador) ─────────────────────────

INSERT INTO rounds (id, tournament_id, player_id, status, round_number)
VALUES
  ('00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000201'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000302'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000202'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000303'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000203'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000304'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000204'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000305'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000205'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000306'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000206'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000307'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000207'::uuid, 'in_progress', 1),
  ('00000000-0000-0000-0000-000000000308'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000208'::uuid, 'in_progress', 1)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Hole scores (12/18 por jugador, scores realistas) ─────────────
-- Par 72 standard Los Leones. Distribución de scores coherente con handicap.
-- Insertamos en bulk usando VALUES + generate_series style.

-- Helper: creamos un temp array de scores por player, 12 hoyos, par 4 default.
-- Scores tomados del mismo set que DEMO01 ronda libre para coherencia.

DO $$
DECLARE
  v_scores JSONB;
  v_player_round JSONB;
  v_hole_num INT;
  v_par INT;
  v_gross INT;
  v_round_id UUID;
BEGIN
  -- Array de (round_id, scores_json) por jugador.
  FOR v_player_round IN SELECT * FROM jsonb_array_elements('[
    {"round_id":"00000000-0000-0000-0000-000000000301","scores":{"1":4,"2":5,"3":3,"4":4,"5":5,"6":4,"7":3,"8":5,"9":4,"10":4,"11":5,"12":3}},
    {"round_id":"00000000-0000-0000-0000-000000000302","scores":{"1":5,"2":4,"3":4,"4":5,"5":4,"6":5,"7":3,"8":4,"9":5,"10":5,"11":4,"12":4}},
    {"round_id":"00000000-0000-0000-0000-000000000303","scores":{"1":3,"2":4,"3":3,"4":4,"5":4,"6":4,"7":3,"8":4,"9":4,"10":3,"11":4,"12":4}},
    {"round_id":"00000000-0000-0000-0000-000000000304","scores":{"1":5,"2":6,"3":4,"4":5,"5":5,"6":6,"7":4,"8":5,"9":6,"10":5,"11":5,"12":5}},
    {"round_id":"00000000-0000-0000-0000-000000000305","scores":{"1":4,"2":4,"3":4,"4":5,"5":4,"6":4,"7":3,"8":5,"9":4,"10":4,"11":5,"12":4}},
    {"round_id":"00000000-0000-0000-0000-000000000306","scores":{"1":4,"2":5,"3":3,"4":5,"5":5,"6":4,"7":4,"8":5,"9":5,"10":4,"11":5,"12":4}},
    {"round_id":"00000000-0000-0000-0000-000000000307","scores":{"1":6,"2":5,"3":4,"4":6,"5":6,"6":5,"7":4,"8":6,"9":5,"10":5,"11":6,"12":5}},
    {"round_id":"00000000-0000-0000-0000-000000000308","scores":{"1":4,"2":5,"3":3,"4":4,"5":5,"6":4,"7":3,"8":4,"9":5,"10":4,"11":4,"12":3}}
  ]'::jsonb)
  LOOP
    v_round_id := (v_player_round->>'round_id')::uuid;
    v_scores := v_player_round->'scores';
    FOR v_hole_num IN 1..18 LOOP
      -- Par real si está en course_holes; sino 4 por default.
      SELECT COALESCE(par, 4) INTO v_par
      FROM course_holes ch
      JOIN tournaments t ON t.course_id = (SELECT course_id FROM tournaments WHERE id = '00000000-0000-0000-0000-000000000001'::uuid)
      WHERE ch.course_id = t.course_id AND ch.numero = v_hole_num
      LIMIT 1;
      v_par := COALESCE(v_par, 4);

      IF v_scores ? v_hole_num::text THEN
        v_gross := (v_scores->>v_hole_num::text)::int;
        INSERT INTO hole_scores (round_id, hole_number, par, gross_score, net_score, points, source, status)
        VALUES (v_round_id, v_hole_num, v_par, v_gross, v_gross, 0, 'manual_player', 'confirmed')
        ON CONFLICT (round_id, hole_number) DO NOTHING;
      END IF;
    END LOOP;

    -- Actualizar total_gross en rounds (suma de los 12 hoyos scoreados)
    UPDATE rounds
    SET total_gross = (
      SELECT COALESCE(SUM(gross_score), 0)
      FROM hole_scores
      WHERE round_id = v_round_id AND gross_score IS NOT NULL
    ),
    total_net = (
      SELECT COALESCE(SUM(gross_score), 0)
      FROM hole_scores
      WHERE round_id = v_round_id AND gross_score IS NOT NULL
    )
    WHERE id = v_round_id;
  END LOOP;
END $$;

-- ─── 4. Verificación ──────────────────────────────────────────────────

DO $$
DECLARE
  v_player_count INT;
  v_round_count INT;
  v_score_count INT;
BEGIN
  SELECT COUNT(*) INTO v_player_count FROM players
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND pending_user_id IS NOT NULL;
  SELECT COUNT(*) INTO v_round_count FROM rounds
    WHERE tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;
  SELECT COUNT(*) INTO v_score_count FROM hole_scores hs
    JOIN rounds r ON r.id = hs.round_id
    WHERE r.tournament_id = '00000000-0000-0000-0000-000000000001'::uuid;

  RAISE NOTICE 'Torneo demo populated: % players, % rounds, % hole_scores.',
    v_player_count, v_round_count, v_score_count;
END $$;
