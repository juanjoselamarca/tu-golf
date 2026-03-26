-- RLS Fixes — Audit Hardening 2026-03-24
-- Ejecutar manualmente en Supabase SQL Editor
-- ============================================================

-- Fix 3: ronda_libre_jugadores UPDATE policy
-- Solo el creador de la ronda puede modificar jugadores
-- ANTES de ejecutar, verificar el nombre exacto de la policy existente con:
--   SELECT policyname FROM pg_policies WHERE tablename = 'ronda_libre_jugadores' AND cmd = 'UPDATE';

-- DROP POLICY IF EXISTS "update_ronda_jugadores" ON ronda_libre_jugadores;
-- CREATE POLICY "update_ronda_jugadores" ON ronda_libre_jugadores
--   FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM rondas_libres
--       WHERE rondas_libres.id = ronda_libre_jugadores.ronda_id
--         AND rondas_libres.created_by = auth.uid()
--     )
--   );

-- Fix 4: hole_scores UPDATE policy
-- No permitir modificar scores si la ronda esta cerrada u oficial
-- ANTES de ejecutar, verificar el nombre exacto de la policy existente con:
--   SELECT policyname FROM pg_policies WHERE tablename = 'hole_scores' AND cmd = 'UPDATE';

-- DROP POLICY IF EXISTS "update_hole_scores" ON hole_scores;
-- CREATE POLICY "update_hole_scores" ON hole_scores
--   FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM rounds
--       WHERE rounds.id = hole_scores.round_id
--         AND rounds.status NOT IN ('closed', 'official')
--     )
--   );
