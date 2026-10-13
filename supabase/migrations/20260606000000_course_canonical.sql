-- ============================================================
-- import-hardening — identidad canónica de cancha (NO destructivo)
-- ============================================================
-- Agrega:
--   canonical_course_id  → alias: una ficha duplicada apunta a la buena.
--   nombre_canonico      → nombre normalizado (sin sufijo de género), para agrupar.
--   genero_norm          → D/V/X derivado del sufijo (NO colapsa DAMAS/VARONES).
-- Y dos pisos duros a nivel DB:
--   uq_courses_fedegolf_natural → idempotencia del sync FedeGolf (atomiza upsert).
--   [DIFERIDO] índice anti-duplicados (nombre_canonico, genero_norm, fuente):
--     se crea en el Barrido A (scripts/barrido-dedup-canchas.mjs) DESPUÉS de
--     colapsar los 3 clusters duplicados existentes (marbella/rocas golfcourseapi,
--     brisas manual). Crearlo ahora fallaría (3 conflictos verificados 2026-06-06).
--
-- El RPC calcular_indice_golfers NO se toca.
-- ============================================================

-- Alias canónico (reversible, deja rastro). No se colapsan filas físicamente.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS canonical_course_id uuid REFERENCES courses(id);

-- Nombre canónico: lower + sin sufijo de género. NO strip de loops (Este/Norte/...)
-- a propósito: las combinaciones de recorrido de FedeGolf son canchas distintas.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS nombre_canonico text
  GENERATED ALWAYS AS (
    lower(regexp_replace(nombre, '\s*\((DAMAS|VARONES|CABALLEROS)\)\s*', '', 'gi'))
  ) STORED;

-- Género derivado del sufijo. DAMAS/VARONES siguen siendo filas distintas (by design).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS genero_norm text
  GENERATED ALWAYS AS (
    CASE WHEN nombre ~* '\(DAMAS\)' THEN 'D'
         WHEN nombre ~* '\(VARONES\)|\(CABALLEROS\)' THEN 'V'
         ELSE 'X' END
  ) STORED;

-- Piso duro: no dos canchas FedeGolf con la misma (club, cancha). Hace el upsert
-- de fedegolf-sync.ts atómico (onConflict) en vez de find-then-insert con carrera.
-- Verificado: 0 grupos en conflicto al 2026-06-06.
--
-- IMPORTANTE: índice NO parcial. Un índice parcial (WHERE ...) NO puede ser
-- inferido por `ON CONFLICT (cols)` del cliente JS (Postgres exige el predicado,
-- error 42P10). Como índice completo sí lo infiere. Las filas no-FedeGolf tienen
-- (NULL, NULL) y los NULL son distintos entre sí en un UNIQUE → conviven sin
-- conflicto. Las filas FedeGolf siempre traen ambos → unicidad garantizada.
DROP INDEX IF EXISTS uq_courses_fedegolf_natural;
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_fedegolf_natural
  ON courses (fedegolf_club_id, fedegolf_cancha_id);
