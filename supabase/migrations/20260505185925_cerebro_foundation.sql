-- Migration 034 — Cerebro v2 foundation
-- Crea las 3 tablas que sostienen el motor predictivo del coach tAIger+:
--   coach_plans      → plan activo asignado por el coach (1 active por usuario)
--   plan_outcomes    → medición por ronda nueva contra el plan activo
--   coach_events     → event sourcing inmutable para Admin Brain + KPIs
--
-- Referencia canónica: docs/CEREBRO_DATA_MODEL.md §2
-- Plan: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.1
-- FASE 0 audit: docs/audit/CEREBRO_V2_FASE0.md (cero conflicto de nombres confirmado)

BEGIN;

-- =====================================================================
-- 1) coach_plans — plan activo asignado por el coach
-- =====================================================================

CREATE TABLE coach_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pattern_id      TEXT NOT NULL,
  pattern_version INTEGER NOT NULL DEFAULT 1,

  hypothesis      TEXT NOT NULL,
  rule            TEXT NOT NULL,

  metric          TEXT NOT NULL,
  target_value    NUMERIC NOT NULL,
  target_op       TEXT NOT NULL DEFAULT 'lte'
                    CHECK (target_op IN ('lte', 'gte', 'eq')),
  baseline_value  NUMERIC,
  duration_days   INTEGER NOT NULL DEFAULT 21,

  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'resolved', 'expired', 'superseded', 'cancelled')),
  resolution_reason TEXT,

  observation_data JSONB NOT NULL,
  assigned_by     TEXT NOT NULL DEFAULT 'tAIger'
                    CHECK (assigned_by IN ('tAIger', 'admin')),
  session_id      UUID REFERENCES taiger_sessions(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

-- Solo UN plan active por usuario al mismo tiempo (regla de negocio dura).
-- Partial unique index permite múltiples plans en otros estados (resolved/expired/etc).
CREATE UNIQUE INDEX coach_plans_one_active_per_user
  ON coach_plans (user_id) WHERE status = 'active';

CREATE INDEX idx_coach_plans_user    ON coach_plans(user_id);
CREATE INDEX idx_coach_plans_status  ON coach_plans(status);
CREATE INDEX idx_coach_plans_pattern ON coach_plans(pattern_id);

ALTER TABLE coach_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_plans_select_own ON coach_plans
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY coach_plans_insert_own ON coach_plans
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY coach_plans_update_own ON coach_plans
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMENT ON TABLE coach_plans IS
  'Plan activo asignado por tAIger+. 1 active por usuario (partial unique). Lifecycle: active -> resolved/expired/superseded/cancelled.';

-- =====================================================================
-- 2) plan_outcomes — medición por ronda nueva
-- =====================================================================

CREATE TABLE plan_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  historical_round_id UUID REFERENCES historical_rounds(id) ON DELETE SET NULL,
  ronda_libre_id      UUID REFERENCES rondas_libres(id) ON DELETE SET NULL,
  played_at        TIMESTAMPTZ NOT NULL,

  metric_value      NUMERIC NOT NULL,
  delta_vs_baseline NUMERIC,
  target_reached    BOOLEAN NOT NULL,

  compliance        TEXT NOT NULL
                      CHECK (compliance IN ('full', 'partial', 'none', 'unknown')),

  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT plan_outcomes_one_round_source CHECK (
    (historical_round_id IS NOT NULL) OR (ronda_libre_id IS NOT NULL)
  )
);

CREATE INDEX idx_plan_outcomes_plan   ON plan_outcomes(plan_id);
CREATE INDEX idx_plan_outcomes_user   ON plan_outcomes(user_id);
CREATE INDEX idx_plan_outcomes_played ON plan_outcomes(played_at DESC);

ALTER TABLE plan_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_outcomes_select_own ON plan_outcomes
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT/UPDATE solo via service_role en backend (compute_plan_outcome).

COMMENT ON TABLE plan_outcomes IS
  'Medición de la métrica del plan activo cada vez que entra una ronda nueva. Inserción solo via service_role.';

-- =====================================================================
-- 3) coach_events — event sourcing inmutable
-- =====================================================================

CREATE TABLE coach_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
    'round_processed',
    'pattern_detected',
    'pattern_resolved',
    'plan_assigned',
    'plan_outcome',
    'plan_resolved',
    'plan_superseded',
    'session_message',
    'tool_called',
    'context_built',
    'admin_override',
    'hallucination_check'  -- D6: validador shadow contra taiger-hallucination-set.json
  )),
  payload     JSONB NOT NULL,
  related_plan_id    UUID REFERENCES coach_plans(id) ON DELETE SET NULL,
  related_session_id UUID REFERENCES taiger_sessions(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_events_user_created ON coach_events(user_id, created_at DESC);
CREATE INDEX idx_coach_events_type         ON coach_events(type, created_at DESC);

ALTER TABLE coach_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_events_select_admin ON coach_events
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT solo via service_role en backend.

COMMENT ON TABLE coach_events IS
  'Log inmutable de todo lo que el coach hace. Alimenta Admin Brain y KPIs. Inserción solo via service_role.';

COMMIT;
