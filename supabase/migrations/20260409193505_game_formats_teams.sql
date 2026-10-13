-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 020 — Formatos de juego: equipos y parejas
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. formato_juego en rondas_libres ─────────────────────────────────
-- Separar estructura de competencia (formato) de lente de scoring (modo_juego)
ALTER TABLE rondas_libres ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play';

-- Constraint separada para poder agregar formatos sin tocar la constraint existente
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rondas_libres_formato_juego_check'
  ) THEN
    ALTER TABLE rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check
      CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));
  END IF;
END $$;

-- ─── 2. formato_juego en tournaments ───────────────────────────────────
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_formato_juego_check'
  ) THEN
    ALTER TABLE tournaments ADD CONSTRAINT tournaments_formato_juego_check
      CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));
  END IF;
END $$;

-- ─── 3. Backfill formato_juego desde datos existentes ──────────────────
UPDATE rondas_libres SET formato_juego = 'stableford'
  WHERE modo_juego = 'stableford' AND formato_juego = 'stroke_play';
UPDATE rondas_libres SET formato_juego = 'match_play'
  WHERE modo_juego = 'match_play_neto' AND formato_juego = 'stroke_play';

-- ─── 4. Match pairings (para match_play) ──────────────────────────────
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

-- ─── 5. Equipos (para best_ball, scramble, foursome) ──────────────────
CREATE TABLE IF NOT EXISTS ronda_equipos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id        UUID NOT NULL REFERENCES rondas_libres(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  handicap_equipo DECIMAL(4,1),
  scores          JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. Miembros de equipo ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ronda_equipo_jugadores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   UUID NOT NULL REFERENCES ronda_equipos(id) ON DELETE CASCADE,
  jugador_id  UUID NOT NULL REFERENCES ronda_libre_jugadores(id) ON DELETE CASCADE,
  UNIQUE(equipo_id, jugador_id)
);

-- ─── 7. RLS ───────────────────────────────────────────────────────────
ALTER TABLE match_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ronda_equipo_jugadores ENABLE ROW LEVEL SECURITY;

-- Lectura pública (leaderboards son públicos)
DROP POLICY IF EXISTS "read_match_pairings" ON match_pairings;
CREATE POLICY "read_match_pairings" ON match_pairings FOR SELECT USING (true);

DROP POLICY IF EXISTS "read_ronda_equipos" ON ronda_equipos;
CREATE POLICY "read_ronda_equipos" ON ronda_equipos FOR SELECT USING (true);

DROP POLICY IF EXISTS "read_ronda_equipo_jugadores" ON ronda_equipo_jugadores;
CREATE POLICY "read_ronda_equipo_jugadores" ON ronda_equipo_jugadores FOR SELECT USING (true);

-- Escritura: solo el creador de la ronda
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

-- ─── 8. Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_match_pairings_ronda ON match_pairings(ronda_id);
CREATE INDEX IF NOT EXISTS idx_ronda_equipos_ronda ON ronda_equipos(ronda_id);
CREATE INDEX IF NOT EXISTS idx_ronda_equipo_jugadores_equipo ON ronda_equipo_jugadores(equipo_id);
CREATE INDEX IF NOT EXISTS idx_rondas_libres_formato ON rondas_libres(formato_juego);

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Todo idempotente, cero impacto en datos existentes
-- ═══════════════════════════════════════════════════════════════════════════
