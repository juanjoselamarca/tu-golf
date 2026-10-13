-- RLS Security Fixes (2026-09-01)
-- Audit finding: 3 policy issues identified via RLS audit
--
-- FINDING 1: collective_insights — policy rolada como "service_role"
--   pero tenía roles={public}, lo que significa ANY user (incluido anon)
--   podía INSERT/UPDATE/DELETE en esta tabla.
--
-- FINDING 3: push_subscriptions — INSERT policy sin restricción de user_id,
--   permitía a cualquier user autenticado crear subscriptions con user_id ajeno.

-- ── Fix 1: collective_insights ──────────────────────────────────────────────
-- Antes: roles={public} (todas las personas, incluyendo anon)
-- Después: roles={service_role} (solo el backend)

DROP POLICY IF EXISTS "Service role can manage collective insights" ON collective_insights;

CREATE POLICY "service_role_manage_collective_insights"
  ON collective_insights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cualquier usuario autenticado puede leer (para el coach)
-- La escritura queda SOLO para service_role
CREATE POLICY "authenticated_read_collective_insights"
  ON collective_insights
  FOR SELECT
  TO authenticated
  USING (true);


-- ── Fix 3: push_subscriptions — INSERT con user_id constraint ───────────────
-- Antes: WITH CHECK (true) — cualquier autenticado podía insertar con cualquier user_id
-- Después: WITH CHECK (user_id = auth.uid() OR user_id IS NULL)

DROP POLICY IF EXISTS "push_sub_insert" ON push_subscriptions;

CREATE POLICY "push_sub_insert"
  ON push_subscriptions
  FOR INSERT
  TO public
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
