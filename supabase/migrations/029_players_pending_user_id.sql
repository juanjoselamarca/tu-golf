-- 029_players_pending_user_id.sql
-- Extender el patrón pending_user_id a la tabla players (torneos).
--
-- Motivación (CLAUDE.md #5 "soluciones permanentes, nunca parches"):
-- 1. ronda_libre_jugadores ya soporta invitados sin cuenta via pending_user_id.
-- 2. players (torneos) no lo soportaba, forzando user_id NOT NULL con FK a profiles.
-- 3. Clubes chilenos comúnmente reciben invitados no-socios en torneos — feature real.
-- 4. Demo torneo no podía tener jugadores porque requería crear 8 auth users fake.
-- 5. Unificar patrón elimina deuda técnica de ad-hoc workarounds (auth user polución
--    con flag is_demo_user, o schema paralelo guest_players JSONB).
--
-- Casos de uso que este cambio desbloquea:
--   a) Demo torneo 100% funcional con pending_user_id.
--   b) Futuro "invitado en torneo de club" sin registro.
--   c) Migración "invitado se registra → su pending_user_id se convierte en user_id".
--   d) Imports históricos de torneos viejos con jugadores sin cuenta.
--
-- Safe re-run: todo IF NOT EXISTS / DO blocks con IF checks.

-- ─── 1. Drop NOT NULL en user_id ───────────────────────────────────────
-- Permite que un player no tenga user_id (será invitado via pending_user_id).
ALTER TABLE players
  ALTER COLUMN user_id DROP NOT NULL;

-- ─── 2. Columnas nuevas ────────────────────────────────────────────────
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS pending_user_id UUID,
  ADD COLUMN IF NOT EXISTS player_name TEXT;

COMMENT ON COLUMN players.user_id IS
  'ID del usuario registrado (FK a profiles.id). NULL si el jugador es invitado sin cuenta — en ese caso usar pending_user_id + player_name.';
COMMENT ON COLUMN players.pending_user_id IS
  'UUID temporal para jugadores invitados (sin cuenta). Se migra a user_id cuando el jugador se registra. Mismo patrón que ronda_libre_jugadores.pending_user_id.';
COMMENT ON COLUMN players.player_name IS
  'Nombre a mostrar del jugador invitado. Se usa cuando user_id IS NULL. Si user_id está seteado, la UI debe preferir profiles.name.';

-- ─── 3. CHECK constraint: al menos un identificador ───────────────────
-- Cada row debe tener user_id (registrado) O pending_user_id (invitado).
-- Nunca ambos NULL (row huérfana) ni ambos NOT NULL (ambigüedad).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'players_identity_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_identity_check
      CHECK (
        (user_id IS NOT NULL AND pending_user_id IS NULL)
        OR (user_id IS NULL AND pending_user_id IS NOT NULL)
      );
  END IF;
END $$;

-- ─── 4. Índice para queries que buscan por pending_user_id ─────────────
CREATE INDEX IF NOT EXISTS idx_players_pending_user_id
  ON players(pending_user_id)
  WHERE pending_user_id IS NOT NULL;

-- ─── 5. Ampliar UNIQUE (tournament_id, user_id) para casos nullable ────
-- La constraint existente es (tournament_id, user_id). Cuando user_id es NULL,
-- PostgreSQL trata NULLs como distintos, así que no se aplica la unicidad.
-- Agregamos una nueva UNIQUE para (tournament_id, pending_user_id) cuando
-- pending_user_id NO ES NULL, evitando duplicados en el escenario invitado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'players'
      AND indexname = 'players_tournament_id_pending_user_id_key'
  ) THEN
    CREATE UNIQUE INDEX players_tournament_id_pending_user_id_key
      ON players(tournament_id, pending_user_id)
      WHERE pending_user_id IS NOT NULL;
  END IF;
END $$;
