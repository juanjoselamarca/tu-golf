-- ============================================================
-- Golfers+ — Migración: configuración por ronda de un torneo
--
-- Bug P0 (inbox 652707d2): crear un torneo de 2+ rondas fallaba con
--   "rounds: Could not find the 'course_id' column of 'rounds'"
-- porque el wizard insertaba la cancha/fecha de las rondas 2..N en `rounds`,
-- que es la tabla de TARJETAS por jugador (player_id, status, totales). No
-- existía dónde guardar la configuración de juego de cada ronda.
--
-- Decisión de producto (PM, 25-sep-2026): cada ronda de un torneo multi-ronda
-- PUEDE jugarse en cancha y fecha distintas.
--
-- Modelo:
--   · La ronda 1 sigue viviendo en `tournaments` (course_id, hole_count,
--     date_start): es lo que leen todas las pantallas legacy y lo que edita
--     `/organizador/[slug]/editar`. NO se duplica acá.
--   · Las rondas 2..N viven en `tournament_rounds`, una fila por ronda.
--   La regla "qué cancha se juega en la ronda N" está en UN solo lugar:
--   `src/golf/tournament-rounds.ts` (resolveRoundPlayConfig).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number >= 2),
  date DATE,
  course_id UUID REFERENCES public.courses(id),
  hole_count INTEGER NOT NULL CHECK (hole_count IN (9, 18)),
  tee_assignment_mode TEXT CHECK (tee_assignment_mode IN ('per_player', 'per_category', 'manual')),
  custom_si JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_number)
);

COMMENT ON TABLE public.tournament_rounds IS
  'Configuración de juego (cancha, fecha, hoyos) de las rondas 2..N de un torneo. La ronda 1 vive en tournaments.* — ver src/golf/tournament-rounds.ts.';
COMMENT ON COLUMN public.tournament_rounds.round_number IS
  'Siempre >= 2: la ronda 1 es tournaments.course_id/hole_count/date_start (fuente única, editable por el organizador).';

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament
  ON public.tournament_rounds (tournament_id);

-- RLS: misma política que categories / rounds / players ("visibles" para
-- todos: el board público necesita saber en qué cancha se juega cada ronda),
-- escritura sólo del organizador. El route de creación inserta con service role.
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_rounds_select ON public.tournament_rounds;
CREATE POLICY tournament_rounds_select ON public.tournament_rounds
  FOR SELECT USING (true);

DROP POLICY IF EXISTS tournament_rounds_organizer_all ON public.tournament_rounds;
CREATE POLICY tournament_rounds_organizer_all ON public.tournament_rounds
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id AND t.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id AND t.organizer_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- categories.default_tee_color — el wizard lo captura desde mayo-2026 y el
-- motor (`resolvePlayerTee`, eslabón "category") lo lee, pero la columna nunca
-- se creó: `create-tournament` la descartaba en silencio y el SELECT de
-- `lib/data/tournaments/players.ts` devolvía 42703 en prod. Es el NOMBRE del
-- tee de la cancha (`course_tees.nombre`, ej. "azul"), no un color canónico:
-- con canchas distintas por ronda el match es por nombre en la cancha de cada
-- ronda, y si no existe ahí se cae al siguiente eslabón sin inventar.
-- ------------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS default_tee_color TEXT;

COMMENT ON COLUMN public.categories.default_tee_color IS
  'Nombre del tee (course_tees.nombre) por defecto para la categoría. NULL = sin default; el jugador cae al tee global del torneo. Ver src/golf/courses/resolve-player-tee.ts.';
