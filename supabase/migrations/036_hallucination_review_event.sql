-- Migration 036 — hallucination_review event type
--
-- El admin marca cada hallucination_check flagged como 'false_positive' o
-- 'real'. Estos reviews supervisados alimentan la metrica D6 que decide
-- cuando promover el validador de shadow a enforcement (FP rate < 5%).
--
-- Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.8 (D6).

BEGIN;

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
    'session_message',
    'tool_called',
    'context_built',
    'admin_override',
    'hallucination_check',
    'extractor_shadow',
    'hallucination_review'
  ));

COMMIT;
