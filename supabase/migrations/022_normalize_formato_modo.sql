-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 022 — Separar formato_juego de modo_juego (conceptos ortogonales)
--
-- PROBLEMA: modo_juego mezclaba formato de competencia con modo de scoring
--   - 'gross'/'neto' = modo de scoring (si aplica handicap)
--   - 'stableford'/'match_play_neto' = formato de competencia (no son modos)
--
-- SOLUCIÓN:
--   1. Crear columna formato_juego (la 020 nunca se ejecutó en producción)
--   2. Backfill formato_juego desde modo_juego híbrido
--   3. Normalizar modo_juego a solo 'gross'/'neto'
--   4. Constraints limpias en ambas tablas
--
-- ORTOGONAL: cualquier formato puede jugarse gross o neto (excepto stableford
-- que por R&A Rule 32.1b siempre es neto).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Crear columna formato_juego en rondas_libres ──────────────────
ALTER TABLE rondas_libres ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play';

-- ─── 2. Crear columna formato_juego en tournaments ────────────────────
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play';

-- ─── 3. Backfill formato_juego desde modo_juego híbrido ───────────────
-- rondas_libres
UPDATE rondas_libres SET formato_juego = 'stableford'
  WHERE modo_juego = 'stableford' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

UPDATE rondas_libres SET formato_juego = 'match_play'
  WHERE modo_juego = 'match_play_neto' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

-- tournaments
UPDATE tournaments SET formato_juego = 'stableford'
  WHERE modo_juego = 'stableford' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

UPDATE tournaments SET formato_juego = 'match_play'
  WHERE modo_juego = 'match_play_neto' AND (formato_juego IS NULL OR formato_juego = 'stroke_play');

-- ─── 4. Normalizar modo_juego a solo gross/neto ───────────────────────
-- Stableford es siempre neto (R&A Rule 32.1b)
UPDATE rondas_libres SET modo_juego = 'neto'
  WHERE modo_juego = 'stableford';

UPDATE rondas_libres SET modo_juego = 'neto'
  WHERE modo_juego = 'match_play_neto';

UPDATE tournaments SET modo_juego = 'neto'
  WHERE modo_juego = 'stableford';

UPDATE tournaments SET modo_juego = 'neto'
  WHERE modo_juego = 'match_play_neto';

-- ─── 5. formato_juego NOT NULL con default ────────────────────────────
UPDATE rondas_libres SET formato_juego = 'stroke_play' WHERE formato_juego IS NULL;
UPDATE tournaments SET formato_juego = 'stroke_play' WHERE formato_juego IS NULL;

ALTER TABLE rondas_libres ALTER COLUMN formato_juego SET NOT NULL;
ALTER TABLE rondas_libres ALTER COLUMN formato_juego SET DEFAULT 'stroke_play';

ALTER TABLE tournaments ALTER COLUMN formato_juego SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN formato_juego SET DEFAULT 'stroke_play';

-- ─── 6. Constraints limpias ───────────────────────────────────────────
-- modo_juego: solo gross/neto
ALTER TABLE rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_modo_juego_check;
ALTER TABLE rondas_libres ADD CONSTRAINT rondas_libres_modo_juego_check
  CHECK (modo_juego IN ('gross', 'neto'));

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_modo_juego_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_modo_juego_check
  CHECK (modo_juego IN ('gross', 'neto'));

-- formato_juego: los 6 formatos soportados
ALTER TABLE rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_formato_juego_check;
ALTER TABLE rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check
  CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_formato_juego_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_formato_juego_check
  CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));

-- ─── 7. Index para queries por formato ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rondas_libres_formato ON rondas_libres(formato_juego);
CREATE INDEX IF NOT EXISTS idx_tournaments_formato ON tournaments(formato_juego);

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Después de esta migración:
--   modo_juego     ∈ {'gross','neto'}
--   formato_juego  ∈ {'stroke_play','stableford','match_play','best_ball','scramble','foursome'}
--   Ambos son ortogonales (excepto stableford que fuerza neto).
-- ═══════════════════════════════════════════════════════════════════════════
