-- ============================================================
-- Golfers+ — Seed de canchas chilenas principales
-- Ejecutar en: Supabase > SQL Editor
-- Idempotente: seguro de re-ejecutar (ON CONFLICT DO NOTHING)
-- ============================================================
--
-- NOTA IMPORTANTE:
-- Los pares y stroke index incluidos son valores estandar/aproximados.
-- La distribucion de pares sigue el patron tipico chileno:
--   4 par-3, 10 par-4, 4 par-5 = par 72
-- Los stroke index usan distribucion estandar:
--   Front 9 = indices impares (1,3,5,7,9,11,13,15,17)
--   Back 9  = indices pares   (2,4,6,8,10,12,14,16,18)
--
-- Cuando se obtengan datos oficiales de cada club, actualizar
-- los valores de par y stroke_index por hoyo.
-- ============================================================

-- ── 0. ASEGURAR UNIQUE CONSTRAINT EN courses.nombre ─────────
-- Necesario para ON CONFLICT. Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'courses'::regclass
      AND conname = 'courses_nombre_key'
  ) THEN
    ALTER TABLE courses ADD CONSTRAINT courses_nombre_key UNIQUE (nombre);
  END IF;
END $$;

-- ── 1. INSERTAR CANCHAS ─────────────────────────────────────

INSERT INTO courses (nombre, ciudad, pais, par_total, tipo_recorrido, activa, fuente)
VALUES
  ('Granadilla Golf Club', 'Santiago', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Golf Los Leones', 'Santiago', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Golf La Dehesa', 'Santiago', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Prince of Wales Country Club', 'Santiago', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Golf Sport Français', 'Santiago', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Golf Las Brisas de Chicureo', 'Santiago', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Rocas de Santo Domingo Golf', 'Santo Domingo', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Golf Cachagua', 'Zapallar', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Golf Marbella', 'Marbella', 'Chile', 72, '18h', true, 'seed_manual'),
  ('Club de Campo del Pacífico', 'Coquimbo', 'Chile', 72, '18h', true, 'seed_manual')
ON CONFLICT (nombre) DO NOTHING;

-- ── 2. INSERTAR HOYOS POR CANCHA ────────────────────────────
-- Cada bloque usa un subquery para obtener el course_id por nombre.
-- ON CONFLICT en (course_id, numero) para idempotencia.

-- ── 2.1 Granadilla Golf Club ────────────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 1, 4, 7),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 2, 5, 3),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 3, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 5, 4, 1),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 6, 4, 9),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 7, 5, 5),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 10, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 11, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 12, 5, 6),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 13, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 14, 4, 4),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 15, 4, 12),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 16, 5, 10),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 17, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Granadilla Golf Club'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.2 Club de Golf Los Leones ─────────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 1, 4, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 2, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 3, 5, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 5, 4, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 6, 4, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 7, 5, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 10, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 11, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 12, 5, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 13, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 14, 4, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 15, 4, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 16, 5, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 17, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Los Leones'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.3 Club de Golf La Dehesa ──────────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 1, 4, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 2, 5, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 3, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 4, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 5, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 6, 4, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 7, 5, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 8, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 10, 4, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 11, 5, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 12, 4, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 13, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 14, 4, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 15, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 16, 5, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 17, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf La Dehesa'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.4 Prince of Wales Country Club ────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 1, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 2, 5, 7),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 3, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 5, 4, 1),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 6, 4, 9),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 7, 5, 5),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 11, 5, 6),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 12, 4, 12),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 13, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 14, 4, 4),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 15, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 16, 5, 8),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 17, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Prince of Wales Country Club'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.5 Club de Golf Sport Français ─────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 1, 4, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 2, 4, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 3, 5, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 5, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 6, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 7, 5, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 11, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 12, 5, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 13, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 14, 4, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 15, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 16, 5, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 17, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Sport Français'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.6 Club de Golf Las Brisas de Chicureo ─────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 1, 4, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 2, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 3, 5, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 5, 4, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 6, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 7, 5, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 11, 5, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 12, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 13, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 14, 4, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 15, 4, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 16, 5, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 17, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Las Brisas de Chicureo'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.7 Rocas de Santo Domingo Golf ─────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 1, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 2, 5, 1),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 3, 4, 9),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 4, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 5, 4, 5),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 6, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 7, 5, 7),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 8, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 11, 5, 4),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 12, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 13, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 14, 4, 6),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 15, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 16, 5, 12),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 17, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Rocas de Santo Domingo Golf'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.8 Club de Golf Cachagua ───────────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 1, 4, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 2, 5, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 3, 4, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 5, 4, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 6, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 7, 5, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 11, 5, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 12, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 13, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 14, 4, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 15, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 16, 5, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 17, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Cachagua'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.9 Club de Golf Marbella ───────────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 1, 4, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 2, 4, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 3, 5, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 4, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 5, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 6, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 7, 5, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 8, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 11, 5, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 12, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 13, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 14, 4, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 15, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 16, 5, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 17, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Golf Marbella'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ── 2.10 Club de Campo del Pacífico ─────────────────────────
INSERT INTO course_holes (course_id, numero, par, stroke_index) VALUES
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 1, 4, 3),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 2, 5, 1),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 3, 4, 7),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 4, 3, 15),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 5, 4, 5),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 6, 4, 11),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 7, 5, 9),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 8, 3, 17),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 9, 4, 13),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 10, 4, 2),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 11, 5, 4),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 12, 4, 10),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 13, 3, 18),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 14, 4, 6),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 15, 4, 8),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 16, 5, 12),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 17, 3, 16),
  ((SELECT id FROM courses WHERE nombre = 'Club de Campo del Pacífico'), 18, 4, 14)
ON CONFLICT (course_id, numero) DO NOTHING;

-- ============================================================
-- RESUMEN: 10 canchas chilenas con 18 hoyos cada una (180 hoyos total)
--
-- Todas usan par 72 con distribucion estandar:
--   Par 3: hoyos 4, 8 (front) y 13, 17 (back)  — varia por cancha
--   Par 5: hoyos 2/3/7 (front) y 11/12/16 (back) — varia por cancha
--   Par 4: los 10 restantes
--
-- Stroke index: distribucion estandar con variaciones por cancha.
-- Front 9 usa indices impares, Back 9 usa indices pares.
--
-- PENDIENTE: verificar datos reales con cada club y actualizar.
-- ============================================================
