-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN V2 — Vista admin_daily_metrics
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

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
