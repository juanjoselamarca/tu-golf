-- Migration 040 — extiende coach_events.type con 5 nuevos eventos para el
-- loop "plan + cumplimiento" (sub-proyecto A v2.1, chat lane).
--
-- Lista PRE-EXISTENTE verificada contra prod 2026-05-11 vía
-- scripts/inspect-coach-events-types.sql (15 types).
-- Lista NUEVA: 5 types añadidos. Total post-migration: 20 types.
--
-- Spec:  docs/superpowers/specs/2026-05-08-taiger-plan-cumplimiento-design.md
-- Plan:  docs/superpowers/plans/2026-05-08-taiger-plan-cumplimiento-plan.md §0.1
-- Rollback: supabase/migrations/rollback/040_coach_events_rollback.sql

BEGIN;

ALTER TABLE public.coach_events DROP CONSTRAINT IF EXISTS coach_events_type_check;

ALTER TABLE public.coach_events ADD CONSTRAINT coach_events_type_check CHECK (type IN (
  -- PRE-EXISTENTES (15) — capturados literal de prod, NO modificar:
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
  'plan_accepted_by_user',
  -- NUEVOS (5) — sub-proyecto A v2.1:
  'practice_session_logged',     -- usuario reportó práctica explícita
  'quick_reply_picked',          -- telemetría de chip elegido en chat
  'plan_check_in_confirmed',     -- usuario confirmó alineación ronda↔plan
  'plan_check_in_dismissed',     -- usuario dijo "fue suerte / ronda normal"
  'voice_input_used'             -- telemetría Tier 2 (Web Speech API)
));

COMMIT;
