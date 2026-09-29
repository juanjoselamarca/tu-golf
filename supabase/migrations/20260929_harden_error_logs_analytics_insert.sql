-- Harden error_logs INSERT policy: constrain field sizes to prevent storage abuse.
-- The current policy is `with_check: true` for {anon, authenticated} — completely open.
-- Anon INSERT must stay (client-side captureError uses anon key) but with limits.
--
-- Constraints:
--   message: required, max 1000 chars
--   level: must be one of error/warn/warning/info/debug/fatal
--   source: optional but max 200 chars
--   page: optional but max 500 chars
--   metadata: JSONB max 5000 chars (serialized)
--
-- This blocks abuse (unlimited rows with huge payloads) while allowing all
-- legitimate captureError calls from the client and server.

BEGIN;

-- 1. Drop the old unrestricted error_logs INSERT policy
DROP POLICY IF EXISTS "Clientes insertan logs de error" ON error_logs;

-- 2. Create hardened error_logs INSERT policy
CREATE POLICY "error_logs_insert_constrained" ON error_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- message is required and bounded
    message IS NOT NULL
    AND length(message) > 0
    AND length(message) <= 1000
    -- level must be a known value
    AND level IS NOT NULL
    AND level IN ('error', 'warn', 'warning', 'info', 'debug', 'fatal')
    -- source is optional but bounded
    AND (source IS NULL OR length(source) <= 200)
    -- page is optional but bounded
    AND (page IS NULL OR length(page) <= 500)
    -- metadata JSONB is optional but bounded
    AND (metadata IS NULL OR length(metadata::text) <= 5000)
  );

-- 3. Harden analytics_events INSERT policy: add event_data size limit.
-- Current policy only checks event_type not null and length 1-100.
-- event_data (JSONB) is unbounded — attacker could send huge payloads.
DROP POLICY IF EXISTS "insert_analytics" ON analytics_events;

CREATE POLICY "analytics_insert_constrained" ON analytics_events
  FOR INSERT
  TO public
  WITH CHECK (
    event_type IS NOT NULL
    AND length(event_type) > 0
    AND length(event_type) <= 100
    -- session_id optional but bounded
    AND (session_id IS NULL OR length(session_id) <= 200)
    -- device_type optional but bounded
    AND (device_type IS NULL OR length(device_type) <= 50)
    -- event_data JSONB bounded
    AND (event_data IS NULL OR length(event_data::text) <= 5000)
  );

COMMIT;
