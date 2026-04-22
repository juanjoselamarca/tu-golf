-- ============================================================
-- Golfers+ — Seed Demo Data
-- ============================================================
-- Corre UNA SOLA VEZ en Supabase Dashboard → SQL Editor.
-- Idempotente (ON CONFLICT DO NOTHING). Re-ejecutable.
--
-- Crea:
--   1. Torneo demo con slug 'demo-copa-chile-2026'
--   2. Ronda libre demo con codigo 'DEMO01'
--   3. 8 jugadores fake con scores parciales realistas en la ronda libre
--
-- Requisito: migration 028_es_demo_column.sql aplicada primero.
-- Si no hay cancha real disponible, la ronda libre se crea con course_id=NULL
-- y course_name='Club de Golf Los Leones' (hardcoded, safe).
-- ============================================================

-- ─── 1. Torneo demo ─────────────────────────────────────────────────────

INSERT INTO tournaments (
  id, slug, name, format, formato_juego, modo_juego,
  hole_count, tees, created_by, date_start, es_demo
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'demo-copa-chile-2026',
  'Copa Golfers+ Chile Demo',
  'stroke_play',
  'stroke_play',
  'gross',
  18,
  'blanco',
  NULL,  -- sin creator real
  CURRENT_DATE,  -- fecha de hoy para que se vea "activo"
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Ronda libre demo ────────────────────────────────────────────────

INSERT INTO rondas_libres (
  id, codigo, course_name, course_id, tees, holes, fecha,
  estado, modo_juego, formato_juego, admin_mode, hoyo_inicio, es_demo
)
VALUES (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'DEMO01',
  'Club de Golf Los Leones',
  NULL,  -- sin course_id real (safe; la UI maneja course_name solo)
  'blanco',
  18,
  CURRENT_DATE,
  'en_curso',
  'gross',
  'stroke_play',
  false,
  1,
  true
)
ON CONFLICT (codigo) DO NOTHING;

-- ─── 3. Jugadores demo con scores parciales realistas ──────────────────
-- 8 jugadores, scores variados, 12/18 hoyos completos (para mostrar "en vivo")
-- Índices dispersos (5 - 22) para que el leaderboard tenga rango real

INSERT INTO ronda_libre_jugadores (id, ronda_id, nombre, user_id, pending_user_id, scores, handicap, tees)
VALUES
  ('00000000-0000-0000-0000-000000000101'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Juan Pérez', NULL, '00000000-0000-0000-0000-000000000101'::uuid,
   '{"1":4,"2":5,"3":3,"4":4,"5":5,"6":4,"7":3,"8":5,"9":4,"10":4,"11":5,"12":3}'::jsonb,
   8.3, 'blanco'),
  ('00000000-0000-0000-0000-000000000102'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'María González', NULL, '00000000-0000-0000-0000-000000000102'::uuid,
   '{"1":5,"2":4,"3":4,"4":5,"5":4,"6":5,"7":3,"8":4,"9":5,"10":5,"11":4,"12":4}'::jsonb,
   12.5, 'blanco'),
  ('00000000-0000-0000-0000-000000000103'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Diego Silva', NULL, '00000000-0000-0000-0000-000000000103'::uuid,
   '{"1":3,"2":4,"3":3,"4":4,"5":4,"6":4,"7":3,"8":4,"9":4,"10":3,"11":4,"12":4}'::jsonb,
   5.1, 'azul'),
  ('00000000-0000-0000-0000-000000000104'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Catalina Rojas', NULL, '00000000-0000-0000-0000-000000000104'::uuid,
   '{"1":5,"2":6,"3":4,"4":5,"5":5,"6":6,"7":4,"8":5,"9":6,"10":5,"11":5,"12":5}'::jsonb,
   18.7, 'rojo'),
  ('00000000-0000-0000-0000-000000000105'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Pedro Fuentes', NULL, '00000000-0000-0000-0000-000000000105'::uuid,
   '{"1":4,"2":4,"3":4,"4":5,"5":4,"6":4,"7":3,"8":5,"9":4,"10":4,"11":5,"12":4}'::jsonb,
   9.8, 'blanco'),
  ('00000000-0000-0000-0000-000000000106'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Francisca Morales', NULL, '00000000-0000-0000-0000-000000000106'::uuid,
   '{"1":4,"2":5,"3":3,"4":5,"5":5,"6":4,"7":4,"8":5,"9":5,"10":4,"11":5,"12":4}'::jsonb,
   14.2, 'rojo'),
  ('00000000-0000-0000-0000-000000000107'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Matías Herrera', NULL, '00000000-0000-0000-0000-000000000107'::uuid,
   '{"1":6,"2":5,"3":4,"4":6,"5":6,"6":5,"7":4,"8":6,"9":5,"10":5,"11":6,"12":5}'::jsonb,
   22.1, 'blanco'),
  ('00000000-0000-0000-0000-000000000108'::uuid, '00000000-0000-0000-0000-000000000002'::uuid,
   'Valentina Castro', NULL, '00000000-0000-0000-0000-000000000108'::uuid,
   '{"1":4,"2":5,"3":3,"4":4,"5":5,"6":4,"7":3,"8":4,"9":5,"10":4,"11":4,"12":3}'::jsonb,
   11.0, 'blanco')
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Verificación final ──────────────────────────────────────────────

DO $$
DECLARE
  v_torneo_count INT;
  v_ronda_count INT;
  v_jugadores_count INT;
BEGIN
  SELECT COUNT(*) INTO v_torneo_count FROM tournaments WHERE es_demo = true;
  SELECT COUNT(*) INTO v_ronda_count FROM rondas_libres WHERE es_demo = true;
  SELECT COUNT(*) INTO v_jugadores_count
    FROM ronda_libre_jugadores
    WHERE ronda_id = '00000000-0000-0000-0000-000000000002'::uuid;

  RAISE NOTICE 'Demo seed completo: % torneo(s), % ronda(s), % jugadores.',
    v_torneo_count, v_ronda_count, v_jugadores_count;

  IF v_torneo_count < 1 OR v_ronda_count < 1 OR v_jugadores_count < 8 THEN
    RAISE WARNING 'Seed incompleto — revisar CONFLICTS o FK constraints.';
  END IF;
END $$;
