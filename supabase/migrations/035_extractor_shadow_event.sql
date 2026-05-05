-- Migration 035 — Extractor shadow event type
--
-- Agrega 'extractor_shadow' al CHECK enum de coach_events.type. Este evento
-- registra lo que el regex extractor (deuda historica de tAIger+) hubiera
-- capturado de cada respuesta — corre en sombra por 7 dias para comparar
-- contra las llamadas reales de la tool save_plan. Si la divergencia es
-- <5% al dia 7, el shadow extractor entero se borra del backend.
--
-- Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §5.4.3 (D3).

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
    'extractor_shadow'
  ));

COMMIT;
