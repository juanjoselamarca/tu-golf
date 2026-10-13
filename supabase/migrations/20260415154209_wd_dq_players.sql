-- ============================================================
-- Migración 025: WD/DQ en torneos (soft-delete de jugadores)
-- ============================================================
-- Problema: withdrawPlayer hace hard-delete de players + rounds + hole_scores.
-- Se pierde historial. Además no hay distinción entre retiro voluntario
-- (WD) y descalificación (DQ) como exige el reglamento USGA.
--
-- Fix: extender CHECK para aceptar 'disqualified' y dejar de borrar filas.
-- Las rondas y scores se conservan; el leaderboard filtra por status.
-- ============================================================

-- 1) Extender CHECK constraint en players.status para incluir 'disqualified'
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_status_check;
ALTER TABLE players
  ADD CONSTRAINT players_status_check
  CHECK (status IN ('pending','approved','waitlist','withdrawn','disqualified'));

-- 2) Índice para queries de leaderboard que filtran por status
CREATE INDEX IF NOT EXISTS idx_players_tournament_status
  ON players(tournament_id, status);

-- 3) Columna de motivo (opcional, útil para DQ)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN players.status IS
  'Estado del jugador: pending | approved | waitlist | withdrawn | disqualified.
   WD = withdrawn (retiro voluntario). DQ = disqualified (descalificación USGA).
   Las rondas y scores se conservan aunque el jugador esté WD/DQ.';
