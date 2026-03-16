-- ════════════════════════════════════════════════════════════════════════════
-- SPRINT 9B — Tu Golf: modo_juego + GWI + scoring completo
-- Ejecutar en: https://hoswfwhvcgqlqdmzpnce.supabase.co → SQL Editor
-- Fecha: 2026-03-16
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Modo de juego en todas las tablas relevantes ───────────────────────
ALTER TABLE rondas_libres
  ADD COLUMN IF NOT EXISTS modo_juego TEXT DEFAULT 'gross'
  CHECK (modo_juego IN ('gross', 'neto', 'stableford'));

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS modo_juego TEXT DEFAULT 'gross'
  CHECK (modo_juego IN ('gross', 'neto', 'stableford'));

ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS modo_juego TEXT DEFAULT 'gross'
  CHECK (modo_juego IN ('gross', 'neto', 'stableford'));

-- ── 2. Asegurar que hole_scores tiene los 3 scores ────────────────────────
ALTER TABLE hole_scores ADD COLUMN IF NOT EXISTS net_score INTEGER;
ALTER TABLE hole_scores ADD COLUMN IF NOT EXISTS points    INTEGER DEFAULT 0;

-- ── 3. Tablas Sprint 9 (idempotente) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_patterns (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  pattern_type   TEXT NOT NULL,
  confidence     DECIMAL(3,2) DEFAULT 0.0,
  data_points    INTEGER DEFAULT 0,
  metadata       JSONB DEFAULT '{}',
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_updated   TIMESTAMPTZ DEFAULT NOW(),
  status         TEXT DEFAULT 'active'
    CHECK (status IN ('active','improving','resolved')),
  UNIQUE(user_id, pattern_type)
);
ALTER TABLE player_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_patterns" ON player_patterns;
CREATE POLICY "own_patterns" ON player_patterns
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS taiger_sessions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_type        TEXT NOT NULL
    CHECK (session_type IN ('post_round','weekly_plan','pre_tournament','onboarding')),
  tournament_id       UUID REFERENCES tournaments(id),
  ronda_libre_id      UUID REFERENCES rondas_libres(id),
  messages            JSONB DEFAULT '[]',
  techniques_assigned JSONB DEFAULT '[]',
  mental_notes        TEXT,
  next_focus          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE taiger_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_sessions" ON taiger_sessions;
CREATE POLICY "own_sessions" ON taiger_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS player_psych_profile (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_answers   JSONB DEFAULT '{}',
  identity_score       DECIMAL(3,1),
  pressure_response    TEXT CHECK (pressure_response IN ('activacion','paralisis','mixto')),
  motivation_type      TEXT CHECK (motivation_type IN ('competitivo','disfrute','social')),
  primary_fear         TEXT,
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE player_psych_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_psych" ON player_psych_profile;
CREATE POLICY "own_psych" ON player_psych_profile
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS garmin_connections (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  garmin_user_id   TEXT,
  last_sync        TIMESTAMPTZ,
  status           TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','active','expired','revoked')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE garmin_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_garmin" ON garmin_connections;
CREATE POLICY "own_garmin" ON garmin_connections
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS handicap_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  handicap_index DECIMAL(4,1),
  source         TEXT DEFAULT 'manual'
    CHECK (source IN ('manual','calculated','garmin')),
  calculated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE handicap_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_handicap" ON handicap_history;
CREATE POLICY "own_handicap" ON handicap_history
  FOR ALL USING (auth.uid() = user_id);

-- ── 4. Profile columns ────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS patterns_need_recalc BOOLEAN DEFAULT FALSE;

-- ── 5. Índices de performance ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_player_patterns_user
  ON player_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_taiger_sessions_user
  ON taiger_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_historical_rounds_user
  ON historical_rounds(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_hole_scores_round
  ON hole_scores(round_id);
CREATE INDEX IF NOT EXISTS idx_course_holes_course_numero
  ON course_holes(course_id, numero);
CREATE INDEX IF NOT EXISTS idx_rondas_libres_codigo
  ON rondas_libres(codigo);
CREATE INDEX IF NOT EXISTS idx_ronda_jugadores_ronda
  ON ronda_libre_jugadores(ronda_id);

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN: si no hay errores arriba, el sprint 9B está listo en BD.
-- ══════════════════════════════════════════════════════════════════════════
