-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — 3 tablas de modo equipos para ronda libre (best_ball / scramble /
-- foursome). Equivalente a las secciones 4-8 de `020_game_formats_teams.sql`
-- que NUNCA se aplicó a prod (ver comentario en `022_normalize_formato_modo.sql`).
--
-- Las secciones 1-3 de la 020 (columna formato_juego + check constraints +
-- backfills) ya fueron cubiertas por la 022. Lo que falta son SOLO las tablas
-- de team data y match pairings + RLS + índices.
--
-- Audit 2026-05-17 fase 2: el código de `score-grupo/page.tsx` y de
-- `api/ronda-libre/create/route.ts` REFERENCIA estas tablas hace meses, pero
-- como no existen, intentos de usar modo equipos en ronda libre fallan en
-- silencio. Esta migración + las RPCs `upsert_ronda_equipos_scores` cierran
-- el agujero.
--
-- Cero impacto sobre torneos activos: NO toca `tournaments` ni `rondas_libres`,
-- solo CREATE TABLE IF NOT EXISTS sobre tablas que hoy no existen.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Match pairings (para ronda libre match_play) ──────────────────
CREATE TABLE IF NOT EXISTS match_pairings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id    UUID NOT NULL REFERENCES rondas_libres(id) ON DELETE CASCADE,
  jugador_a_id UUID NOT NULL REFERENCES ronda_libre_jugadores(id) ON DELETE CASCADE,
  jugador_b_id UUID NOT NULL REFERENCES ronda_libre_jugadores(id) ON DELETE CASCADE,
  hcp_diff_a  INTEGER DEFAULT 0,
  hcp_diff_b  INTEGER DEFAULT 0,
  nassau      BOOLEAN DEFAULT FALSE,
  resultado   JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ronda_id, jugador_a_id, jugador_b_id)
);

-- ─── 2. Equipos (para best_ball, scramble, foursome) ──────────────────
CREATE TABLE IF NOT EXISTS ronda_equipos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id        UUID NOT NULL REFERENCES rondas_libres(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  handicap_equipo DECIMAL(4,1),
  scores          JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. Miembros de equipo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ronda_equipo_jugadores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   UUID NOT NULL REFERENCES ronda_equipos(id) ON DELETE CASCADE,
  jugador_id  UUID NOT NULL REFERENCES ronda_libre_jugadores(id) ON DELETE CASCADE,
  UNIQUE(equipo_id, jugador_id)
);

-- ─── 4. RLS ───────────────────────────────────────────────────────────
ALTER TABLE match_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_equipo_jugadores ENABLE ROW LEVEL SECURITY;

-- Lectura pública (leaderboards son públicos, mismo patrón que ronda_libre_jugadores).
DROP POLICY IF EXISTS "read_match_pairings" ON match_pairings;
CREATE POLICY "read_match_pairings" ON match_pairings FOR SELECT USING (true);

DROP POLICY IF EXISTS "read_ronda_equipos" ON ronda_equipos;
CREATE POLICY "read_ronda_equipos" ON ronda_equipos FOR SELECT USING (true);

DROP POLICY IF EXISTS "read_ronda_equipo_jugadores" ON ronda_equipo_jugadores;
CREATE POLICY "read_ronda_equipo_jugadores" ON ronda_equipo_jugadores FOR SELECT USING (true);

-- Escritura: solo el creador de la ronda.
DROP POLICY IF EXISTS "manage_match_pairings" ON match_pairings;
CREATE POLICY "manage_match_pairings" ON match_pairings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM rondas_libres r WHERE r.id = ronda_id AND r.creador_id = auth.uid()
  ));

DROP POLICY IF EXISTS "manage_ronda_equipos" ON ronda_equipos;
CREATE POLICY "manage_ronda_equipos" ON ronda_equipos FOR ALL
  USING (EXISTS (
    SELECT 1 FROM rondas_libres r WHERE r.id = ronda_id AND r.creador_id = auth.uid()
  ));

DROP POLICY IF EXISTS "manage_ronda_equipo_jugadores" ON ronda_equipo_jugadores;
CREATE POLICY "manage_ronda_equipo_jugadores" ON ronda_equipo_jugadores FOR ALL
  USING (EXISTS (
    SELECT 1 FROM ronda_equipos e
    JOIN rondas_libres r ON r.id = e.ronda_id
    WHERE e.id = equipo_id AND r.creador_id = auth.uid()
  ));

-- ─── 5. Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_match_pairings_ronda ON match_pairings(ronda_id);
CREATE INDEX IF NOT EXISTS idx_ronda_equipos_ronda ON ronda_equipos(ronda_id);
CREATE INDEX IF NOT EXISTS idx_ronda_equipo_jugadores_equipo ON ronda_equipo_jugadores(equipo_id);
