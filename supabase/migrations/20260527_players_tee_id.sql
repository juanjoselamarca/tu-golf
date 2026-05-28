-- 20260527_players_tee_id.sql
-- bug #6 inbox 25-may: tee por admin

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS tee_id UUID NULL REFERENCES course_tees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS players_tee_id_idx ON players(tee_id) WHERE tee_id IS NOT NULL;

COMMENT ON COLUMN players.tee_id IS
  'Asignación manual del admin (modo manual de tee_assignment_mode). Nullable: si NULL → cae al fallback category.default_tee_color → tournament.tees.';
