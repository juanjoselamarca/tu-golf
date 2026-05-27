-- 20260527_cerebro_v3_observability.sql
-- Ola 0 del cerebro v3 — infraestructura transversal, parte 1.
--
-- Crea la tabla `cerebro_weights` para pesos paramétricos vivos del cerebro,
-- + trigger Postgres `pg_notify` que dispara invalidación distribuida de
-- cache cross-process (Supabase Realtime escucha el canal NOTIFY).
--
-- Nota de naming: el plan original lo llamó `037_cerebro_v3_observability.sql`,
-- pero ya existen dos migraciones con prefijo `037_` y la convención vigente
-- (memoria 10882, 24-may-2026) es `YYYYMMDD_descripcion.sql`. Adaptado.
--
-- Idempotente: se puede re-ejecutar sin efectos secundarios.

BEGIN;

-- 1) Pesos paramétricos vivos (modificables en vivo desde admin)
CREATE TABLE IF NOT EXISTS cerebro_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_type text NOT NULL CHECK (parameter_type IN ('block','pattern','source','user_cluster')),
  parameter_key text NOT NULL,
  current_weight numeric(5,4) NOT NULL CHECK (current_weight BETWEEN 0 AND 1),
  previous_weight numeric(5,4),
  user_cluster_id uuid,
  source text NOT NULL CHECK (source IN ('auto','manual','seed')),
  version integer NOT NULL DEFAULT 1,
  locked_until timestamptz,
  last_auto_update_at timestamptz,
  last_manual_override_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parameter_type, parameter_key, user_cluster_id)
);

CREATE INDEX IF NOT EXISTS idx_cerebro_weights_lookup
  ON cerebro_weights (parameter_type, parameter_key)
  WHERE user_cluster_id IS NULL;

-- 2) Trigger para invalidación distribuida vía pg_notify
--    Supabase Realtime escucha sobre canales NOTIFY estándar.
CREATE OR REPLACE FUNCTION notify_cerebro_weights_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('cerebro_weights_updated', json_build_object(
    'parameter_type', NEW.parameter_type,
    'parameter_key', NEW.parameter_key,
    'updated_at', NEW.updated_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cerebro_weights_notify ON cerebro_weights;
CREATE TRIGGER trg_cerebro_weights_notify
AFTER INSERT OR UPDATE ON cerebro_weights
FOR EACH ROW EXECUTE FUNCTION notify_cerebro_weights_change();

-- 3) RLS — lectura pública (no son datos personales), escritura solo admin
ALTER TABLE cerebro_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cerebro_weights_read_public" ON cerebro_weights;
CREATE POLICY "cerebro_weights_read_public"
  ON cerebro_weights FOR SELECT USING (true);

DROP POLICY IF EXISTS "cerebro_weights_write_admin" ON cerebro_weights;
CREATE POLICY "cerebro_weights_write_admin"
  ON cerebro_weights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4) Event log del cerebro (alimenta el tablero del coach)
CREATE TABLE IF NOT EXISTS cerebro_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL,
  weights_snapshot jsonb,
  latency_ms integer,
  cost_usd numeric(8,5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cerebro_events_user_time ON cerebro_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cerebro_events_type_time ON cerebro_events (event_type, created_at DESC);

ALTER TABLE cerebro_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cerebro_events_read_admin" ON cerebro_events;
CREATE POLICY "cerebro_events_read_admin"
  ON cerebro_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "cerebro_events_insert_service" ON cerebro_events;
CREATE POLICY "cerebro_events_insert_service"
  ON cerebro_events FOR INSERT TO service_role WITH CHECK (true);

-- 5) Cost tracking por feature y proveedor
CREATE TABLE IF NOT EXISTS cost_tracking (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  feature text NOT NULL,
  provider text NOT NULL,
  tokens_input integer,
  tokens_output integer,
  cost_usd numeric(8,5) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_user_day ON cost_tracking (user_id, created_at);

ALTER TABLE cost_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_tracking_read_admin" ON cost_tracking;
CREATE POLICY "cost_tracking_read_admin"
  ON cost_tracking FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6) Banco de pruebas — runs de evaluación contra perfiles sintéticos
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by text NOT NULL,
  ola_version text,
  profiles_evaluated text[],
  results jsonb NOT NULL,
  pass boolean NOT NULL,
  evaluator_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evaluation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluation_runs_admin" ON evaluation_runs;
CREATE POLICY "evaluation_runs_admin"
  ON evaluation_runs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 7) Versionado de LLM con fallback explícito
CREATE TABLE IF NOT EXISTS llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('primary_chat','reasoning','evaluator','embedding','rerank')),
  status text NOT NULL CHECK (status IN ('active','fallback','deprecated','retired')),
  context_window integer,
  cost_per_1m_tokens_input numeric(8,4),
  cost_per_1m_tokens_output numeric(8,4),
  embedding_dim integer,
  fallback_to_model_id text,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE llm_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "llm_models_read_public" ON llm_models;
CREATE POLICY "llm_models_read_public"
  ON llm_models FOR SELECT USING (true);

DROP POLICY IF EXISTS "llm_models_write_admin" ON llm_models;
CREATE POLICY "llm_models_write_admin"
  ON llm_models FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed de los 5 roles iniciales (Vercel AI Gateway naming convention)
INSERT INTO llm_models (model_id, role, status, context_window, cost_per_1m_tokens_input, cost_per_1m_tokens_output, embedding_dim, fallback_to_model_id, config)
VALUES
  ('anthropic/claude-sonnet-4-6', 'primary_chat', 'active', 200000, 3.0, 15.0, NULL, 'anthropic/claude-haiku-4-5', '{}'),
  ('anthropic/claude-opus-4-7', 'reasoning', 'active', 200000, 15.0, 75.0, NULL, 'anthropic/claude-sonnet-4-6', '{}'),
  ('anthropic/claude-haiku-4-5', 'evaluator', 'active', 200000, 0.25, 1.25, NULL, NULL, '{}'),
  ('openai/text-embedding-3-small', 'embedding', 'active', NULL, 0.02, NULL, 1536, NULL, '{}'),
  ('cohere/rerank-multilingual-v3.0', 'rerank', 'active', NULL, NULL, NULL, NULL, NULL, '{}')
ON CONFLICT (model_id) DO NOTHING;

-- 8) Feature flag por usuario para rollback seguro entre cerebro v2 y v3
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cerebro_v3_enabled boolean NOT NULL DEFAULT false;

COMMIT;
