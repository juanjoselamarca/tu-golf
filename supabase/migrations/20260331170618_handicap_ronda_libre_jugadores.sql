-- ============================================================
-- Golfers+ · Migración 011: Handicap en ronda_libre_jugadores
-- 31 marzo 2026
-- YA EJECUTADO en producción via exec_sql
-- ============================================================

ALTER TABLE ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS handicap DECIMAL(4,1) DEFAULT NULL;

COMMENT ON COLUMN ronda_libre_jugadores.handicap IS
  'Handicap del jugador al momento de crear la ronda. Copiado de profiles.indice. Usado para cálculos de score neto y Stableford.';

-- Backfill: copiar handicap desde profiles para jugadores existentes
UPDATE ronda_libre_jugadores rlj
SET handicap = p.indice
FROM profiles p
WHERE rlj.user_id = p.id
  AND rlj.handicap IS NULL
  AND p.indice IS NOT NULL;
