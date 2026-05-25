-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — tablas tournament_teams + tournament_team_members
--
-- Closes the gap descubierto en auditoría FTUE 22-may (PR #41):
-- el wizard "Organizar Torneo Equipos" deja al usuario configurar formato
-- Best Ball / Scramble / Foursome, persiste team_config en tournament_drafts.config
-- (JSONB), pero al publicar el draft → tournament, NO existe ningún schema
-- para materializar los equipos. Resultado: el organizador llega a
-- /organizador/<slug>/jugadores y ve UI de scoring individual.
--
-- Esta migración crea la persistencia de equipos a nivel torneo. Distinto
-- de `ronda_equipos` que es para RONDA LIBRE (FK a ronda_id). Acá el equipo
-- vive en el TORNEO (FK a tournament_id) y persiste entre rondas si el
-- torneo tiene multi-ronda.
--
-- Cero impacto sobre torneos existentes: CREATE TABLE IF NOT EXISTS sobre
-- tablas que hoy no existen. Tampoco toca players ni tournaments.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla tournament_teams ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,                                    -- hex con default por posición (paleta de 8)
  position SMALLINT NOT NULL DEFAULT 1,          -- orden de visualización
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_teams_position_unique UNIQUE (tournament_id, position),
  CONSTRAINT tournament_teams_name_unique UNIQUE (tournament_id, name)
);

-- ─── 2. Tabla tournament_team_members ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position SMALLINT,                             -- orden dentro del equipo (opcional)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_team_members_player_unique UNIQUE (player_id)
);

-- ─── 3. Índices ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament
  ON tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_members_team
  ON tournament_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_members_player
  ON tournament_team_members(player_id);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_team_members ENABLE ROW LEVEL SECURITY;

-- Lectura pública (leaderboards de torneo son públicos, mismo patrón que
-- tournament_groups y players).
DROP POLICY IF EXISTS "read_tournament_teams" ON tournament_teams;
CREATE POLICY "read_tournament_teams" ON tournament_teams
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "read_tournament_team_members" ON tournament_team_members;
CREATE POLICY "read_tournament_team_members" ON tournament_team_members
  FOR SELECT USING (true);

-- Escritura: solo el organizer del torneo. Mismo patrón que
-- tournament_groups → tournaments.organizer_id = auth.uid().
DROP POLICY IF EXISTS "manage_tournament_teams" ON tournament_teams;
CREATE POLICY "manage_tournament_teams" ON tournament_teams
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_teams.tournament_id
        AND t.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_teams.tournament_id
        AND t.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "manage_tournament_team_members" ON tournament_team_members;
CREATE POLICY "manage_tournament_team_members" ON tournament_team_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM tournament_teams tt
      JOIN tournaments t ON t.id = tt.tournament_id
      WHERE tt.id = tournament_team_members.team_id
        AND t.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tournament_teams tt
      JOIN tournaments t ON t.id = tt.tournament_id
      WHERE tt.id = tournament_team_members.team_id
        AND t.organizer_id = auth.uid()
    )
  );

-- ─── 5. Comentarios documentales ──────────────────────────────────────────
COMMENT ON TABLE tournament_teams IS
  'Equipos a nivel torneo (Best Ball, Scramble, Foursome). Persisten entre rondas. '
  'Distinto de ronda_equipos que es para Ronda Libre standalone (FK ronda_id).';
COMMENT ON TABLE tournament_team_members IS
  'Membresía 1:1 player→team por torneo. UNIQUE(player_id) garantiza que un '
  'jugador esté en UN solo equipo dentro del torneo.';
COMMENT ON COLUMN tournament_teams.position IS
  'Orden de visualización (1..N). UNIQUE por torneo.';
COMMENT ON COLUMN tournament_teams.color IS
  'Hex del color. Si NULL, UI aplica paleta por defecto basada en position.';
