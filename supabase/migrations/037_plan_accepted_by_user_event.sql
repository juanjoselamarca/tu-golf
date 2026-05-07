-- Migration 037 — plan_accepted_by_user event type
--
-- El usuario aprieta "Aceptar plan" en la card formal del chat. Ese acto
-- queda registrado para alimentar el dashboard de efectividad: tasa de
-- aceptación = aceptados / asignados.

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
    'hallucination_review',
    'plan_accepted_by_user'
  ));

COMMIT;
