-- Cerebro V3 — Ola 3 chunk 2: pattern_observations
-- La serie cruda per-ronda de cada patrón, sobre la que corre el validador
-- anti-fantasía (pattern-validator.ts).
-- GOTCHA Ola 2 (round_metrics): la fuente de rondas es historical_rounds
-- (historial con scores/par/diferencial), NO rounds (torneo). Toda FK acá apunta
-- a historical_rounds.

CREATE TABLE IF NOT EXISTS pattern_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pattern_id uuid NOT NULL REFERENCES pattern_definitions(id) ON DELETE CASCADE,
  -- Denormalizado a propósito: todo el chunk 1 liga la matemática por key
  -- (MEASURE_BY_KEY / OBSERVE_BY_KEY). Evita el join en el camino caliente.
  pattern_key text NOT NULL,
  pattern_version integer NOT NULL,
  round_id uuid NOT NULL REFERENCES historical_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Valor crudo de la métrica per-ronda, en la orientación del catálogo
  -- (más alto = peor; front_nine_struggles guarda el signo ya invertido).
  value numeric NOT NULL,
  metadata jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_id, round_id)
);

-- Camino caliente del validador: serie de un usuario por patrón.
CREATE INDEX IF NOT EXISTS idx_pattern_obs_user_key
  ON pattern_observations (user_id, pattern_key, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pattern_obs_round
  ON pattern_observations (round_id);

-- RLS: espejo de round_metrics (dueño lee, service_role escribe).
ALTER TABLE pattern_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pattern_obs_owner_read ON pattern_observations;
CREATE POLICY pattern_obs_owner_read ON pattern_observations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pattern_obs_service_write ON pattern_observations;
CREATE POLICY pattern_obs_service_write ON pattern_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Pesos por patrón individual en el paramétrico vivo: 1 fila 'pattern' por
-- patrón gen-0, sincronizada con el weight default de pattern_definitions.
-- Aparecen como sliders en /admin/cerebro/pesos y se propagan en vivo (Realtime).
-- Idempotente vía NOT EXISTS (la UNIQUE es (type,key,user_cluster_id) y
-- user_cluster_id NULL es distinto de NULL en la UNIQUE → NOT EXISTS evita dups).
INSERT INTO cerebro_weights (parameter_type, parameter_key, current_weight, source)
SELECT 'pattern', pd.pattern_key, pd.weight, 'seed'
FROM pattern_definitions pd
WHERE pd.generation = 0
  AND NOT EXISTS (
    SELECT 1 FROM cerebro_weights w
    WHERE w.parameter_type = 'pattern'
      AND w.parameter_key = pd.pattern_key
      AND w.user_cluster_id IS NULL
  );
