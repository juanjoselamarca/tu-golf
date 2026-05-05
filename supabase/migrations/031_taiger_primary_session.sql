-- Migration 017: tAIger+ primary session per user
-- Cada usuario tiene UNA sesion primaria continua. El resto del historial
-- queda como sesiones legacy (session_type != 'continuous') para no perder data.

-- 1. Agregar 'continuous' al enum de session_type (back-compat con tipos legacy).
ALTER TABLE taiger_sessions
  DROP CONSTRAINT IF EXISTS taiger_sessions_session_type_check;

ALTER TABLE taiger_sessions
  ADD CONSTRAINT taiger_sessions_session_type_check
  CHECK (session_type = ANY (ARRAY[
    'continuous'::text,
    'post_round'::text,
    'weekly_plan'::text,
    'pre_tournament'::text,
    'onboarding'::text,
    'free'::text
  ]));

-- 2. Columna is_primary para identificar la sesion continua activa.
ALTER TABLE taiger_sessions
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Indice unico parcial: solo puede haber 1 sesion primaria por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS taiger_sessions_user_primary_unique
  ON taiger_sessions (user_id)
  WHERE is_primary = true;

-- Marcar la sesion mas reciente de cada usuario como primaria,
-- migrando data existente a la nueva estructura.
WITH most_recent AS (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM taiger_sessions
  ORDER BY user_id, created_at DESC
)
UPDATE taiger_sessions ts
SET is_primary = true,
    session_type = 'continuous'
FROM most_recent mr
WHERE ts.id = mr.id;
