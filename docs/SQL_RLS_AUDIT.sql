-- ============================================================
-- SQL_RLS_AUDIT.sql — Tu Golf
-- Politicas RLS e indices para todas las tablas del proyecto
-- Generado: 2026-03-17
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- 2. RONDAS_LIBRES
-- ────────────────────────────────────────────────────────────
ALTER TABLE rondas_libres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rondas_libres_select_own"
  ON rondas_libres FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "rondas_libres_insert_own"
  ON rondas_libres FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "rondas_libres_update_own"
  ON rondas_libres FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "rondas_libres_delete_own"
  ON rondas_libres FOR DELETE
  USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_rondas_libres_created_by
  ON rondas_libres (created_by);

CREATE INDEX IF NOT EXISTS idx_rondas_libres_codigo
  ON rondas_libres (codigo);

-- ────────────────────────────────────────────────────────────
-- 3. RONDA_LIBRE_JUGADORES
-- ────────────────────────────────────────────────────────────
ALTER TABLE ronda_libre_jugadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ronda_libre_jugadores_select_via_ronda"
  ON ronda_libre_jugadores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rondas_libres
      WHERE rondas_libres.id = ronda_libre_jugadores.ronda_libre_id
        AND rondas_libres.created_by = auth.uid()
    )
  );

CREATE POLICY "ronda_libre_jugadores_insert_via_ronda"
  ON ronda_libre_jugadores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rondas_libres
      WHERE rondas_libres.id = ronda_libre_jugadores.ronda_libre_id
        AND rondas_libres.created_by = auth.uid()
    )
  );

CREATE POLICY "ronda_libre_jugadores_update_via_ronda"
  ON ronda_libre_jugadores FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rondas_libres
      WHERE rondas_libres.id = ronda_libre_jugadores.ronda_libre_id
        AND rondas_libres.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_ronda_id
  ON ronda_libre_jugadores (ronda_libre_id);

CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_user_id
  ON ronda_libre_jugadores (user_id);

-- ────────────────────────────────────────────────────────────
-- 4. HISTORICAL_ROUNDS
-- ────────────────────────────────────────────────────────────
ALTER TABLE historical_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historical_rounds_select_own"
  ON historical_rounds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "historical_rounds_insert_own"
  ON historical_rounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "historical_rounds_update_own"
  ON historical_rounds FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "historical_rounds_delete_own"
  ON historical_rounds FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_historical_rounds_user_id
  ON historical_rounds (user_id);

CREATE INDEX IF NOT EXISTS idx_historical_rounds_played_at
  ON historical_rounds (played_at DESC);

CREATE INDEX IF NOT EXISTS idx_historical_rounds_user_played
  ON historical_rounds (user_id, played_at DESC);

-- ────────────────────────────────────────────────────────────
-- 5. COURSE_HOLES
-- ────────────────────────────────────────────────────────────
ALTER TABLE course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_holes_select_all"
  ON course_holes FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_course_holes_course_id
  ON course_holes (course_id);

-- ────────────────────────────────────────────────────────────
-- 6. COURSES
-- ────────────────────────────────────────────────────────────
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_select_all"
  ON courses FOR SELECT
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 7. PLAYERS (torneos)
-- ────────────────────────────────────────────────────────────
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_select_own"
  ON players FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "players_insert_own"
  ON players FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_players_user_id
  ON players (user_id);

-- ────────────────────────────────────────────────────────────
-- 8. ANALYTICS_EVENTS
-- ────────────────────────────────────────────────────────────
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_events_insert_own"
  ON analytics_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "analytics_events_select_own"
  ON analytics_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON analytics_events (user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type
  ON analytics_events (event_type);

-- ────────────────────────────────────────────────────────────
-- 9. TAIGER_SESSIONS
-- ────────────────────────────────────────────────────────────
ALTER TABLE taiger_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taiger_sessions_select_own"
  ON taiger_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "taiger_sessions_insert_own"
  ON taiger_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_taiger_sessions_user_id
  ON taiger_sessions (user_id);

-- ============================================================
-- FIN — Ejecutar en Supabase SQL Editor en orden
-- ============================================================
