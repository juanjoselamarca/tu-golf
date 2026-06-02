-- 20260602_cerebro_v3_ola2_conocer.sql
-- Cerebro V3 — Ola 2 "el coach te conoce": target del jugador + métricas
-- relativas por ronda + memoria episódica. 100% aditivo: cerebro v2 sigue
-- corriendo en paralelo. Spec: docs/superpowers/specs/2026-06-02-cerebro-v3-ola2-conocer-design.md

-- ── Target del jugador (sin formulario; lo setea el coach vía tool set_target) ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_handicap numeric(4,1),
  ADD COLUMN IF NOT EXISTS target_deadline date,
  ADD COLUMN IF NOT EXISTS target_set_at timestamptz;

-- ── Métricas relativas por ronda ──
CREATE TABLE IF NOT EXISTS round_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strokes_over_par_round numeric(4,1) NOT NULL,
  delta_vs_handicap_expected numeric(4,1) NOT NULL,
  delta_vs_target_handicap numeric(4,1),
  holes_played integer NOT NULL,
  par_cancha integer NOT NULL,
  handicap_at_time numeric(4,1),
  target_at_time numeric(4,1),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id),
  -- delta_vs_target_handicap solo puede ser NULL si target_at_time es NULL
  CONSTRAINT delta_vs_target_consistency CHECK (
    (target_at_time IS NULL AND delta_vs_target_handicap IS NULL) OR
    (target_at_time IS NOT NULL AND delta_vs_target_handicap IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_round_metrics_user_time
  ON round_metrics (user_id, computed_at DESC);

-- ── Memoria episódica (hechos extraídos por el coach, no historial literal) ──
CREATE TABLE IF NOT EXISTS coach_episodic_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,              -- 'health','schedule','equipment','goal','preference', etc.
  fact text NOT NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_session_id uuid,
  source_message_id uuid,
  superseded_by uuid REFERENCES coach_episodic_memory(id),
  expires_at timestamptz,              -- facts temporales ("esta semana no juego")
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Nota: el predicado parcial NO puede usar now() (no IMMUTABLE). Indexamos los
-- facts vigentes (no superseded) y la expiración se filtra en query.
CREATE INDEX IF NOT EXISTS idx_episodic_user_active
  ON coach_episodic_memory (user_id, category)
  WHERE superseded_by IS NULL;

-- ── RLS: cada usuario lee lo suyo; escritura vía service_role (como plan-engine) ──
ALTER TABLE round_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_episodic_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS round_metrics_owner_read ON round_metrics;
CREATE POLICY round_metrics_owner_read ON round_metrics
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS round_metrics_service_write ON round_metrics;
CREATE POLICY round_metrics_service_write ON round_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS episodic_owner_read ON coach_episodic_memory;
CREATE POLICY episodic_owner_read ON coach_episodic_memory
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS episodic_service_write ON coach_episodic_memory;
CREATE POLICY episodic_service_write ON coach_episodic_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);
