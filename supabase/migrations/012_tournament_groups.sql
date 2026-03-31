-- ============================================================
-- Golfers+ · Migración 012: Grupos de torneo + conexión a rondas
-- 31 marzo 2026 — YA EJECUTADO en producción
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tee_time TIMESTAMPTZ,
  ronda_libre_id UUID REFERENCES rondas_libres(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournament_group_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  jugador_ronda_id UUID REFERENCES ronda_libre_jugadores(id),
  UNIQUE(group_id, player_id)
);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS afecta_estadisticas BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE;

-- RLS
ALTER TABLE tournament_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_group_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read tournament_groups"
  ON tournament_groups FOR SELECT USING (true);
CREATE POLICY "Public read tournament_group_players"
  ON tournament_group_players FOR SELECT USING (true);
CREATE POLICY "Organizer manage tournament_groups"
  ON tournament_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id AND t.organizer_id = auth.uid()));
CREATE POLICY "Organizer manage tournament_group_players"
  ON tournament_group_players FOR ALL
  USING (EXISTS (SELECT 1 FROM tournament_groups tg JOIN tournaments t ON t.id = tg.tournament_id WHERE tg.id = group_id AND t.organizer_id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournament_groups_tournament ON tournament_groups(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_group_players_group ON tournament_group_players(group_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_codigo ON tournaments(codigo) WHERE codigo IS NOT NULL;

COMMENT ON TABLE tournament_groups IS 'Grupos de salida. Cada grupo se vincula a una ronda_libre para scoring.';
COMMENT ON COLUMN tournaments.afecta_estadisticas IS 'true = individual (afecta CPI/índice). false = equipo (solo torneo).';
COMMENT ON COLUMN tournaments.codigo IS 'Código de 6 caracteres para inscripción por link.';
