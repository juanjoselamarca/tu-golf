-- ══════════════════════════════════════════════════════════════
-- EJECUTAR EN SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ══════════════════════════════════════════════════════════════

-- ── Tablas Ronda Libre ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rondas_libres (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  creador_id  UUID REFERENCES profiles(id),
  course_id   UUID REFERENCES courses(id),
  course_name TEXT NOT NULL,
  tees        TEXT DEFAULT 'blanco',
  holes       INTEGER DEFAULT 18,
  fecha       DATE NOT NULL,
  estado      TEXT DEFAULT 'en_curso'
                CHECK (estado IN ('en_curso', 'finalizada')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ronda_libre_jugadores (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ronda_id   UUID REFERENCES rondas_libres(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  user_id    UUID REFERENCES profiles(id),
  scores     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rondas_libres         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_libre_jugadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver_rondas" ON rondas_libres
  FOR SELECT USING (true);
CREATE POLICY "crear_ronda" ON rondas_libres
  FOR INSERT WITH CHECK (auth.uid() = creador_id);
CREATE POLICY "actualizar_ronda" ON rondas_libres
  FOR UPDATE USING (auth.uid() = creador_id);

CREATE POLICY "ver_jugadores" ON ronda_libre_jugadores
  FOR SELECT USING (true);
CREATE POLICY "gestionar_jugadores" ON ronda_libre_jugadores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM rondas_libres r
      WHERE r.id = ronda_id AND r.creador_id = auth.uid()
    )
  );
CREATE POLICY "jugador_update_scores" ON ronda_libre_jugadores
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rondas_libres r
      WHERE r.id = ronda_id AND r.creador_id = auth.uid()
    )
  );

-- ── Historial de tarjetas (Sprint 8 anterior) ─────────────────

CREATE TABLE IF NOT EXISTS historical_rounds (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  tee_color   TEXT,
  played_at   DATE NOT NULL,
  scores      JSONB NOT NULL DEFAULT '[]',
  total_gross INTEGER,
  notes       TEXT,
  privacy     TEXT NOT NULL DEFAULT 'private',
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE historical_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_historical_rounds" ON historical_rounds
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public_historical_rounds" ON historical_rounds
  FOR SELECT USING (privacy = 'public');

-- ── Campos opcionales en hole_scores ──────────────────────────

ALTER TABLE hole_scores ADD COLUMN IF NOT EXISTS putts       INTEGER;
ALTER TABLE hole_scores ADD COLUMN IF NOT EXISTS fairway_hit BOOLEAN;
ALTER TABLE hole_scores ADD COLUMN IF NOT EXISTS gir         BOOLEAN;

-- ── Índices para queries frecuentes ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rondas_libres_codigo
  ON rondas_libres(codigo);
CREATE INDEX IF NOT EXISTS idx_rondas_libres_creador
  ON rondas_libres(creador_id);
CREATE INDEX IF NOT EXISTS idx_ronda_jugadores_ronda
  ON ronda_libre_jugadores(ronda_id);
CREATE INDEX IF NOT EXISTS idx_course_holes_course
  ON course_holes(course_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer
  ON tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_players_tournament
  ON players(tournament_id);
