-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN DASHBOARD — SQL para Supabase
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tabla: analytics_events ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  session_id TEXT,
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_type_date
  ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user
  ON analytics_events(user_id, created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_analytics" ON analytics_events;
CREATE POLICY "admin_read_analytics" ON analytics_events
  FOR SELECT USING (auth.email() = 'juanjoselamarca@gmail.com');

DROP POLICY IF EXISTS "insert_analytics" ON analytics_events;
CREATE POLICY "insert_analytics" ON analytics_events
  FOR INSERT WITH CHECK (true);

-- ─── Vista: admin_daily_metrics ─────────────────────────────────────────

CREATE OR REPLACE VIEW admin_daily_metrics AS
SELECT
  DATE(created_at) as fecha,
  COUNT(DISTINCT user_id) as dau,
  COUNT(*) FILTER (WHERE event_type = 'ronda_creada') as rondas,
  COUNT(*) FILTER (WHERE event_type = 'torneo_creado') as torneos,
  COUNT(*) FILTER (WHERE event_type = 'tarjeta_historica_agregada') as tarjetas,
  COUNT(*) FILTER (WHERE event_type = 'taiger_sesion_iniciada') as taiger_sessions,
  COUNT(*) FILTER (WHERE event_type = 'ronda_completada') as rondas_completadas
FROM analytics_events
GROUP BY DATE(created_at)
ORDER BY fecha DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Idempotente, seguro de ejecutar múltiples veces
-- ═══════════════════════════════════════════════════════════════════════════
