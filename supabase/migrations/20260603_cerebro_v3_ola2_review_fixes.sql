-- 20260603_cerebro_v3_ola2_review_fixes.sql
-- Fixes del code-review de Ola 2 (2026-06-03):
--  C1: el evento de auditoría 'plan_expired' (plan-lifecycle) no estaba en el
--      enum de coach_events.type → todo insert fallaba en silencio.
--  I1: re-estampar las métricas relativas ya guardadas cuando el jugador fija o
--      cambia su meta, para que delta_vs_target_handicap no quede NULL para
--      siempre en las rondas computadas antes de tener target.

BEGIN;

-- ── C1: agregar 'plan_expired' al enum de coach_events.type ──
ALTER TABLE coach_events DROP CONSTRAINT IF EXISTS coach_events_type_check;
ALTER TABLE coach_events ADD CONSTRAINT coach_events_type_check
  CHECK (type IN (
    'round_processed',
    'pattern_detected',
    'pattern_resolved',
    'plan_assigned',
    'plan_outcome',
    'plan_resolved',
    'plan_superseded',
    'plan_expired',
    'session_message',
    'tool_called',
    'context_built',
    'admin_override',
    'hallucination_check',
    'extractor_shadow',
    'hallucination_review',
    'plan_accepted_by_user'
  ));

-- ── I1: re-estampar target en round_metrics al fijar/cambiar la meta ──
-- diferencial = delta_vs_handicap_expected + handicap_at_time (frozen por ronda),
-- así que delta_vs_target = diferencial − target sin necesitar guardar el diferencial.
-- Respeta el CHECK delta_vs_target_consistency (ambos no nulos juntos).
CREATE OR REPLACE FUNCTION restamp_round_metrics_target(p_user uuid, p_target numeric)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE round_metrics
  SET target_at_time = p_target,
      delta_vs_target_handicap =
        round((delta_vs_handicap_expected + handicap_at_time - p_target)::numeric, 1)
  WHERE user_id = p_user
    AND handicap_at_time IS NOT NULL;
$$;

COMMIT;
