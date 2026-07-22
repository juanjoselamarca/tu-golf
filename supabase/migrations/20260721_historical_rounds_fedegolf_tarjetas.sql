-- Tarjetas del índice FedeGolf en historical_rounds (spec 2026-07-21).
--
-- Verificado en prod: import_source es TEXT (default 'manual') SIN CHECK vivo,
-- así que no se toca ninguna constraint — solo se agregan columnas + índice.
-- Las tarjetas FedeGolf se insertan con import_source='fedegolf' y
-- excluded_from_handicap=TRUE (no alimentan el índice Golfers+; el número
-- oficial vive en profiles.indice y no se recalcula — spec D7).

ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS fedegolf_ticket TEXT;
ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS vale_doble BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN historical_rounds.fedegolf_ticket IS
  'Ticket único de la tarjeta FedeGolf (identidad de dedup). NULL para rondas no-FedeGolf.';
COMMENT ON COLUMN historical_rounds.vale_doble IS
  'Tarjeta de campeonato (modalidad chilena): vale por 2 en el índice oficial. Informativo.';

-- Dedup fuerte: una tarjeta (por ticket) por usuario. Índice parcial completo
-- (solo filtra por NULL, no por otra condición) → upsert puede inferirlo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_historical_rounds_user_ticket
  ON historical_rounds (user_id, fedegolf_ticket)
  WHERE fedegolf_ticket IS NOT NULL;
