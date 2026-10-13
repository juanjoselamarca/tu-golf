-- ============================================================
-- Golfers+ — Migración 005: soporte partida simultánea
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Idempotente — seguro de re-ejecutar
-- ============================================================

ALTER TABLE rondas_libres
  ADD COLUMN IF NOT EXISTS hoyo_inicio INTEGER DEFAULT 1
    CHECK (hoyo_inicio >= 1 AND hoyo_inicio <= 18);

COMMENT ON COLUMN rondas_libres.hoyo_inicio IS
  'Hoyo de partida en partida simultánea. Default 1 (orden normal).
   Genera orden circular: hoyo_inicio=4, holes=18
   → orden de juego: 4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,1,2,3';

CREATE INDEX IF NOT EXISTS idx_rondas_libres_estado
  ON rondas_libres(estado);
