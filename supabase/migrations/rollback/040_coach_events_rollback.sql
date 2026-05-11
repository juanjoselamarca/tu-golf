-- Rollback de migration 040 — vuelve al CHECK pre-existente (15 types).
-- Usar SOLO si los 5 nuevos types causaron incidente.
-- IMPORTANTE: antes de rollback verificar que ningún row de coach_events
-- esté usando los 5 nuevos types. Si los hay, primero DELETE/UPDATE
-- esos rows o el ALTER fallará por CHECK violation.

BEGIN;

-- Verificación pre-rollback (si rows > 0, abortar y limpiar primero):
DO $$
DECLARE
  offending_rows int;
BEGIN
  SELECT COUNT(*) INTO offending_rows
  FROM public.coach_events
  WHERE type IN (
    'practice_session_logged', 'quick_reply_picked',
    'plan_check_in_confirmed', 'plan_check_in_dismissed', 'voice_input_used'
  );
  IF offending_rows > 0 THEN
    RAISE EXCEPTION 'Rollback abortado: % filas usan los nuevos types. Limpiá antes.', offending_rows;
  END IF;
END $$;

ALTER TABLE public.coach_events DROP CONSTRAINT IF EXISTS coach_events_type_check;

ALTER TABLE public.coach_events ADD CONSTRAINT coach_events_type_check CHECK (type IN (
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
