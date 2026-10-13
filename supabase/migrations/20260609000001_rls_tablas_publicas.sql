-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 20260609b: Habilitar RLS en tablas públicas sin protección
-- Fecha: 2026-06-09
-- Descripción: Supabase Advisor reportó 3 tablas CRITICAL "RLS Disabled in Public":
--   error_logs, indice_historial, fedegolf_credentials.
--
--   Las políticas de indice_historial y fedegolf_credentials estaban definidas en
--   la migración 021 pero NUNCA se aplicaron a prod (las tablas se crearon sin el
--   bloque RLS). error_logs (migración 009) nunca tuvo RLS.
--
--   Sin RLS, la anon key (pública, va en cada browser) podía leer/escribir las 3
--   tablas vía PostgREST: credenciales FedeGolf encriptadas, índices WHS por
--   usuario y logs de error con metadata. Esto lo cierra.
--
--   Idempotente: re-ejecutable sin error.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. error_logs
--    Escrita desde el browser con la anon key (src/lib/error-tracking.ts:85) y
--    desde el server con service role (línea 103). Ninguna lectura usa cliente
--    de usuario — el dashboard admin lee vía service role (bypassa RLS).
--    → RLS ON + sólo INSERT para anon/authenticated. Sin SELECT/UPDATE/DELETE:
--      los clientes no pueden leer ni alterar logs ajenos. Service role hace todo.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clientes insertan logs de error" ON error_logs;
CREATE POLICY "Clientes insertan logs de error"
  ON error_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. indice_historial
--    Acceso vía cliente SSR con sesión del usuario (rutas fedegolf). El usuario
--    sólo lee/escribe su propio historial. Service role bypassa para sync/jobs.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE indice_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios leen su propio historial de índice" ON indice_historial;
CREATE POLICY "Usuarios leen su propio historial de índice"
  ON indice_historial FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role inserta historial de índice" ON indice_historial;
DROP POLICY IF EXISTS "Usuarios insertan su propio historial de índice" ON indice_historial;
CREATE POLICY "Usuarios insertan su propio historial de índice"
  ON indice_historial FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. fedegolf_credentials
--    Credenciales encriptadas (RUT + password). Acceso vía cliente SSR con
--    sesión del usuario: cada uno gestiona sólo las suyas. Service role bypassa.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE fedegolf_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios leen sus propias credenciales FedeGolf" ON fedegolf_credentials;
CREATE POLICY "Usuarios leen sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios insertan sus propias credenciales FedeGolf" ON fedegolf_credentials;
CREATE POLICY "Usuarios insertan sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios actualizan sus propias credenciales FedeGolf" ON fedegolf_credentials;
CREATE POLICY "Usuarios actualizan sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios eliminan sus propias credenciales FedeGolf" ON fedegolf_credentials;
CREATE POLICY "Usuarios eliminan sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
