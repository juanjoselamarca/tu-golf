-- ============================================================
-- Golfers+ · Migración 014: Torneos multi-ronda (multi-día)
-- 31 marzo 2026 — YA EJECUTADO en producción
-- ============================================================

-- Agregar round_number para soportar múltiples rondas por jugador
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS round_number INTEGER DEFAULT 1;

-- Agregar total_rounds al torneo
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS total_rounds INTEGER DEFAULT 1;

-- Cambiar UNIQUE: ahora permite múltiples rondas por jugador
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_tournament_id_player_id_key;
ALTER TABLE rounds ADD CONSTRAINT rounds_tournament_player_round_key
  UNIQUE (tournament_id, player_id, round_number);

COMMENT ON COLUMN rounds.round_number IS 'Número de ronda (1, 2, 3, 4). Permite torneos multi-día.';
COMMENT ON COLUMN tournaments.total_rounds IS 'Cantidad de rondas del torneo (1=un día, 2=36 hoyos, 4=72 hoyos PGA).';
