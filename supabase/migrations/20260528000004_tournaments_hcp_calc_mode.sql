-- Gate del cálculo de neto WHS por torneo (decisión Juanjo 28-may-2026).
-- PR #73 (tee-por-admin) cableó el neto a course handicap WHS para TODOS los torneos,
-- lo que alteraría el neto de torneos in_progress a mitad de evento (violación CERO FALLOS).
-- Decisión: WHS solo para torneos NUEVOS. Los existentes congelan el cálculo actual (índice crudo).
--
-- Mecanismo: columna congelada al crear el torneo.
--   raw = neto con índice crudo (handicap_at_registration), comportamiento pre-WHS.
--   whs = course handicap WHS por tee (slope/CR), comportamiento PR #73.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS hcp_calc_mode text NOT NULL DEFAULT 'raw'
  CHECK (hcp_calc_mode IN ('raw', 'whs'));

-- Todos los torneos existentes quedan en 'raw' (default arriba). Los nuevos toman 'whs':
ALTER TABLE tournaments ALTER COLUMN hcp_calc_mode SET DEFAULT 'whs';

COMMENT ON COLUMN tournaments.hcp_calc_mode IS
  'raw = neto con índice crudo (torneos pre-WHS, congelado); whs = course handicap WHS por tee. '
  'Default whs para torneos nuevos; existentes backfilled a raw. Decisión Juanjo 28-may: no alterar torneos in_progress.';
