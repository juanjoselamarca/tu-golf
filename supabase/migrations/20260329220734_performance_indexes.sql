-- Índices de rendimiento para escalar a 10,000+ usuarios
-- Ejecutados en producción el 29 Mar 2026
-- Todos son IF NOT EXISTS — seguros de re-ejecutar

-- Historial por usuario + fecha (pantalla /perfil/historial)
CREATE INDEX IF NOT EXISTS idx_historical_rounds_user_played
  ON historical_rounds(user_id, played_at DESC);

-- Rondas libres activas por estado y fecha (feed /en-vivo, dashboard)
CREATE INDEX IF NOT EXISTS idx_rondas_libres_estado_fecha
  ON rondas_libres(estado, fecha DESC);

-- Jugadores de ronda libre por ronda (leaderboard, score page)
CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_ronda_id
  ON ronda_libre_jugadores(ronda_id);

-- Jugadores de ronda libre por usuario (dashboard "mis rondas")
CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_user_id
  ON ronda_libre_jugadores(user_id);

-- Rondas por fecha descendente (listados recientes)
CREATE INDEX IF NOT EXISTS idx_rondas_libres_fecha_desc
  ON rondas_libres(fecha DESC);

-- Profiles por email (auth lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles(email);

-- tAIger sessions por usuario (historial de coaching)
CREATE INDEX IF NOT EXISTS idx_taiger_sessions_user
  ON taiger_sessions(user_id);
