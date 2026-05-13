-- 20260513_taiger_sessions_add_updated_at.sql
--
-- Bug P0: chat/route.ts hace .update({updated_at, messages, next_focus}) en
-- taiger_sessions, pero la columna updated_at no existía. PostgREST devolvía
-- 400 PGRST204 y el código no chequeaba .error, por lo que messages y
-- next_focus tampoco se persistían desde 2026-05-05 (commit badb5b5).
--
-- Esta migration:
--   1) Agrega la columna updated_at con default NOW() para que las filas
--      existentes queden con timestamp del momento de la migration.
--   2) Backfillea updated_at = created_at en filas previas (proxy histórico
--      consistente).
--   3) Marca la columna NOT NULL.
--   4) Crea el trigger BEFORE UPDATE que setea NEW.updated_at = NOW() en cada
--      update — la app puede mandar updated_at o no, el trigger gana siempre.

BEGIN;

ALTER TABLE taiger_sessions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE taiger_sessions
  SET updated_at = created_at
  WHERE updated_at IS NULL OR updated_at > created_at + INTERVAL '1 second';

ALTER TABLE taiger_sessions
  ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS update_taiger_sessions_updated_at ON taiger_sessions;
CREATE TRIGGER update_taiger_sessions_updated_at
  BEFORE UPDATE ON taiger_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
