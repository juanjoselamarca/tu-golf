-- ============================================================
-- Golfers+ — Migración: seguir una ronda SIN cuenta (round_watchers anónimo)
-- 2026-09-29 · inbox c09c8391 (Rafa, iPhone, sin sesión) + f6cca8e3
--
-- Decisión de producto (PM): un espectador sin cuenta puede seguir una ronda
-- y recibir notificaciones en ese dispositivo.
--
-- Identidad del espectador anónimo = su suscripción push (push_subscriptions.id).
-- Un watcher tiene EXACTAMENTE una identidad: usuario (user_id, se le envía a
-- todos sus dispositivos) o dispositivo (push_subscription_id).
--
-- Aditiva e idempotente. Todo acceso anónimo a estas filas va por API routes con
-- service role: las políticas RLS no dan NINGÚN acceso al rol anon, y el rol
-- authenticated sólo ve/edita lo propio. Antes push_subscriptions permitía a
-- cualquier cliente (incluso anon) leer, actualizar y borrar TODAS las filas con
-- user_id NULL — enumeración/borrado de dispositivos ajenos. Se cierra acá.
-- ============================================================

-- ── round_watchers: identidad por suscripción ──────────────────────────────
ALTER TABLE round_watchers
  ADD COLUMN IF NOT EXISTS push_subscription_id UUID
    REFERENCES push_subscriptions(id) ON DELETE CASCADE;

-- Constraint UNIQUE completo (no parcial): PostgREST `onConflict` necesita un
-- constraint real — un índice parcial da 42P10 (memoria reference_partial_index).
-- NULLs son distintos → las filas por usuario (push_subscription_id NULL) no chocan.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'round_watchers_sub_ronda_key'
  ) THEN
    ALTER TABLE round_watchers
      ADD CONSTRAINT round_watchers_sub_ronda_key UNIQUE (push_subscription_id, ronda_codigo);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'round_watchers_identity_chk'
  ) THEN
    ALTER TABLE round_watchers
      ADD CONSTRAINT round_watchers_identity_chk
      CHECK (user_id IS NOT NULL OR push_subscription_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_round_watchers_sub ON round_watchers(push_subscription_id);

-- ── round_watchers RLS: sólo authenticated y sólo lo propio ────────────────
DROP POLICY IF EXISTS "watcher_select_own" ON round_watchers;
DROP POLICY IF EXISTS "watcher_insert_own" ON round_watchers;
DROP POLICY IF EXISTS "watcher_delete_own" ON round_watchers;
DROP POLICY IF EXISTS "watcher_update_own" ON round_watchers;

CREATE POLICY "watcher_select_own" ON round_watchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "watcher_insert_own" ON round_watchers
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND push_subscription_id IS NULL);
CREATE POLICY "watcher_update_own" ON round_watchers
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "watcher_delete_own" ON round_watchers
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── push_subscriptions RLS: se cierra el hueco "OR user_id IS NULL" ────────
-- Las suscripciones anónimas se crean/borran SOLO desde /api/push/follow y
-- /api/push/round-update (service role). Ningún cliente las lista.
DROP POLICY IF EXISTS "push_sub_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_select_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_update_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_sub_delete_own" ON push_subscriptions;

CREATE POLICY "push_sub_insert" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_sub_select_own" ON push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "push_sub_update_own" ON push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_sub_delete_own" ON push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
