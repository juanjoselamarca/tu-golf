-- =============================================
-- TU GOLF — Schema inicial
-- =============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLA: profiles
-- =============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player'
    CHECK (role IN ('player', 'organizer', 'admin')),
  handicap DECIMAL(4,1),
  avatar_url TEXT,
  garmin_user_id TEXT,
  garmin_access_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: tournaments
-- =============================================
CREATE TABLE tournaments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  course_name TEXT NOT NULL,
  date_start DATE NOT NULL,
  date_end DATE,
  format TEXT NOT NULL DEFAULT 'stroke_play'
    CHECK (format IN ('stroke_play', 'stableford', 'match_play')),
  hole_count INTEGER NOT NULL DEFAULT 18
    CHECK (hole_count IN (9, 18)),
  use_handicap BOOLEAN DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','in_progress','closed','published')),
  scoring_source TEXT DEFAULT 'manual'
    CHECK (scoring_source IN ('manual','hybrid','garmin_first')),
  cover_image_url TEXT,
  tiebreak_rules JSONB DEFAULT '["back_9","back_6","back_3","hole_18"]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: categories
-- =============================================
CREATE TABLE categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  handicap_min DECIMAL(4,1),
  handicap_max DECIMAL(4,1),
  gender TEXT CHECK (gender IN ('M','F')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: flights
-- =============================================
CREATE TABLE flights (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  tee_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: players (inscripciones)
-- =============================================
CREATE TABLE players (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id),
  flight_id UUID REFERENCES flights(id),
  handicap_at_registration DECIMAL(4,1),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','waitlist','withdrawn')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

-- =============================================
-- TABLA: rounds
-- =============================================
CREATE TABLE rounds (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','closed','official')),
  total_gross INTEGER DEFAULT 0,
  total_net INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE(tournament_id, player_id)
);

-- =============================================
-- TABLA: hole_scores
-- =============================================
CREATE TABLE hole_scores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE NOT NULL,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL CHECK (par IN (3,4,5)),
  gross_score INTEGER,
  net_score INTEGER,
  points INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual_player'
    CHECK (source IN (
      'manual_player',
      'manual_organizer',
      'garmin',
      'garmin_provisional'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'loaded',
      'confirmed',
      'corrected',
      'provisional'
    )),
  -- Campos preparados para integración Garmin (Sprint 10)
  garmin_activity_id TEXT,
  garmin_shot_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, hole_number)
);

-- =============================================
-- TABLA: score_audit_log
-- =============================================
CREATE TABLE score_audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hole_score_id UUID REFERENCES hole_scores(id) ON DELETE CASCADE NOT NULL,
  changed_by UUID REFERENCES profiles(id) NOT NULL,
  previous_value INTEGER,
  new_value INTEGER,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TABLA: garmin_connections (inactiva hasta Sprint 10)
-- =============================================
CREATE TABLE garmin_connections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  garmin_user_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  connected BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ÍNDICES para performance
-- =============================================
CREATE INDEX idx_tournaments_slug       ON tournaments(slug);
CREATE INDEX idx_tournaments_organizer  ON tournaments(organizer_id);
CREATE INDEX idx_tournaments_status     ON tournaments(status);
CREATE INDEX idx_players_tournament     ON players(tournament_id);
CREATE INDEX idx_players_user           ON players(user_id);
CREATE INDEX idx_rounds_tournament      ON rounds(tournament_id);
CREATE INDEX idx_rounds_player          ON rounds(player_id);
CREATE INDEX idx_hole_scores_round      ON hole_scores(round_id);
CREATE INDEX idx_hole_scores_round_hole ON hole_scores(round_id, hole_number);
CREATE INDEX idx_audit_hole_score       ON score_audit_log(hole_score_id);

-- =============================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_hole_scores_updated_at
  BEFORE UPDATE ON hole_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- FUNCIÓN: crear perfil automáticamente al registrarse
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'player'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights           ENABLE ROW LEVEL SECURITY;
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hole_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE garmin_connections ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Profiles públicos para lectura"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Usuario edita su propio perfil"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- TOURNAMENTS
CREATE POLICY "Torneos publicados son públicos"
  ON tournaments FOR SELECT
  USING (status IN ('open','in_progress','closed','published'));

CREATE POLICY "Organizador ve todos sus torneos"
  ON tournaments FOR SELECT
  USING (auth.uid() = organizer_id);

CREATE POLICY "Organizador crea torneos"
  ON tournaments FOR INSERT
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizador edita sus torneos"
  ON tournaments FOR UPDATE
  USING (auth.uid() = organizer_id);

-- CATEGORIES (hereda visibilidad del torneo)
CREATE POLICY "Categorías visibles si torneo es público"
  ON categories FOR SELECT USING (true);

CREATE POLICY "Organizador gestiona categorías"
  ON categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tournaments
      WHERE id = tournament_id
      AND organizer_id = auth.uid()
    )
  );

-- PLAYERS
CREATE POLICY "Inscripciones visibles públicamente"
  ON players FOR SELECT USING (true);

CREATE POLICY "Jugador puede inscribirse"
  ON players FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ROUNDS
CREATE POLICY "Rondas visibles públicamente"
  ON rounds FOR SELECT USING (true);

CREATE POLICY "Jugador gestiona su ronda"
  ON rounds FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE id = player_id AND user_id = auth.uid()
    )
  );

-- HOLE SCORES
CREATE POLICY "Scores visibles públicamente"
  ON hole_scores FOR SELECT USING (true);

CREATE POLICY "Jugador carga sus propios scores"
  ON hole_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN players p ON p.id = r.player_id
      WHERE r.id = round_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Jugador edita sus scores no cerrados"
  ON hole_scores FOR UPDATE
  USING (
    status NOT IN ('confirmed','corrected') AND
    EXISTS (
      SELECT 1 FROM rounds r
      JOIN players p ON p.id = r.player_id
      WHERE r.id = round_id AND p.user_id = auth.uid()
    )
  );

-- AUDIT LOG
CREATE POLICY "Audit log visible para organizadores"
  ON score_audit_log FOR SELECT
  USING (auth.uid() = changed_by);

CREATE POLICY "Solo sistema inserta en audit log"
  ON score_audit_log FOR INSERT
  WITH CHECK (auth.uid() = changed_by);
