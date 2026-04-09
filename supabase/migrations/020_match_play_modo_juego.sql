-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 020 — Soporte Match Play Neto en modo_juego
-- Agrega 'match_play_neto' como valor válido en el CHECK constraint
-- de rondas_libres.modo_juego y tournaments.modo_juego
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing constraint and recreate with new value
ALTER TABLE rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_modo_juego_check;
ALTER TABLE rondas_libres ADD CONSTRAINT rondas_libres_modo_juego_check
  CHECK (modo_juego IN ('gross', 'neto', 'stableford', 'match_play_neto'));

-- Same for tournaments
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_modo_juego_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_modo_juego_check
  CHECK (modo_juego IN ('gross', 'neto', 'stableford', 'match_play_neto'));
