-- 023_historical_formato_modo.sql
-- Agregar formato_juego y modo_juego a historical_rounds
-- para que el historial sepa qué tipo de ronda fue.

ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play',
  ADD COLUMN IF NOT EXISTS modo_juego TEXT DEFAULT 'gross';

-- Backfill desde rondas_libres cuando hay link en metadata
UPDATE historical_rounds hr
SET formato_juego = rl.formato_juego,
    modo_juego = rl.modo_juego
FROM rondas_libres rl
WHERE hr.source = 'ronda_libre'
  AND hr.metadata IS NOT NULL
  AND hr.metadata->>'ronda_libre_id' IS NOT NULL
  AND rl.id = (hr.metadata->>'ronda_libre_id')::uuid;

-- NOT NULL después del backfill
UPDATE historical_rounds SET formato_juego = 'stroke_play' WHERE formato_juego IS NULL;
UPDATE historical_rounds SET modo_juego = 'gross' WHERE modo_juego IS NULL;

ALTER TABLE historical_rounds ALTER COLUMN formato_juego SET NOT NULL;
ALTER TABLE historical_rounds ALTER COLUMN formato_juego SET DEFAULT 'stroke_play';
ALTER TABLE historical_rounds ALTER COLUMN modo_juego SET NOT NULL;
ALTER TABLE historical_rounds ALTER COLUMN modo_juego SET DEFAULT 'gross';

-- Constraints
ALTER TABLE historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_formato_check;
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_formato_check
  CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));

ALTER TABLE historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_modo_check;
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_modo_check
  CHECK (modo_juego IN ('gross','neto'));

-- Index
CREATE INDEX IF NOT EXISTS idx_historical_rounds_formato ON historical_rounds(formato_juego);
