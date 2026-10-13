-- P1 Security Fix: profiles SELECT exponía PII a rol anon
-- Cualquier persona sin login podía leer emails, fecha_nacimiento,
-- subscription_tier, subscription_status de todos los usuarios.
-- Fix: restringir SELECT solo a usuarios logueados (authenticated).
-- Las páginas públicas usan API routes con service_role → no se afectan.
-- Aplicado manualmente a prod el 2026-09-22.

DROP POLICY IF EXISTS "Profiles publicos" ON profiles;

CREATE POLICY "Profiles solo autenticados" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);
