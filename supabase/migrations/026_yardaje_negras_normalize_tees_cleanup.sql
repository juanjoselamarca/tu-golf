-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 026 — Rename "campeonato" → "negras" + normalizar tees + cleanup
-- ═══════════════════════════════════════════════════════════════════════════
-- Contexto:
--   1. En Chile el tee de campeonato se llama "negras", no "campeonato".
--   2. Los valores de `tees` en BD están mezclados (español + inglés:
--      'black', 'blue', 'campeonato', 'negro', 'dorado'). Normalizar a
--      nomenclatura chilena única.
--   3. 25 canchas tienen yardajes objetivamente rotos (jerarquía invertida,
--      stroke index duplicado, yardaje ≤ 0). Borrar para evitar exposición.
--
-- Impacto: el código mantiene aliases defensivos en getTeeYardageColumn
-- para datos externos futuros (mScorecard, golfcourseapi, etc.).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Rename column ─────────────────────────────────────────────────────────
ALTER TABLE course_holes RENAME COLUMN yardaje_campeonato TO yardaje_negras;

COMMENT ON COLUMN course_holes.yardaje_negras IS
  'Yardaje desde tee Negras (en yardas). Equivale al tee de campeonato/championship/black de otras nomenclaturas. En Chile el nombre estándar es "negras".';

-- ── 2. Normalizar valores de `tees` en todas las tablas ─────────────────────
-- 'campeonato' / 'negro' / 'black' → 'negras'
UPDATE rondas_libres SET tees = 'negras' WHERE tees IN ('campeonato', 'negro', 'black');
UPDATE ronda_libre_jugadores SET tees = 'negras' WHERE tees IN ('campeonato', 'negro', 'black');
UPDATE tournaments SET tees = 'negras' WHERE tees IN ('campeonato', 'negro', 'black');
UPDATE players SET tees = 'negras' WHERE tees IN ('campeonato', 'negro', 'black');

-- 'blue' → 'azul'
UPDATE rondas_libres SET tees = 'azul' WHERE tees = 'blue';
UPDATE ronda_libre_jugadores SET tees = 'azul' WHERE tees = 'blue';
UPDATE tournaments SET tees = 'azul' WHERE tees = 'blue';
UPDATE players SET tees = 'azul' WHERE tees = 'blue';

-- 'dorado' / 'amarillo' / 'white' → 'blanco' (mismo column físico)
UPDATE rondas_libres SET tees = 'blanco' WHERE tees IN ('dorado', 'amarillo', 'white');
UPDATE ronda_libre_jugadores SET tees = 'blanco' WHERE tees IN ('dorado', 'amarillo', 'white');
UPDATE tournaments SET tees = 'blanco' WHERE tees IN ('dorado', 'amarillo', 'white');
UPDATE players SET tees = 'blanco' WHERE tees IN ('dorado', 'amarillo', 'white');

-- 'red' → 'rojo'
UPDATE rondas_libres SET tees = 'rojo' WHERE tees = 'red';
UPDATE ronda_libre_jugadores SET tees = 'rojo' WHERE tees = 'red';
UPDATE tournaments SET tees = 'rojo' WHERE tees = 'red';
UPDATE players SET tees = 'rojo' WHERE tees = 'red';

-- ── 3. Borrar yardajes de las 25 canchas con violaciones de coherencia ──────
-- Reglas inequívocas (no heurísticas):
--   a) jerarquía invertida (tee de adelante > tee de atrás)
--   b) stroke index duplicado en cancha de 18 hoyos
--   c) yardaje ≤ 0
WITH canchas_rotas AS (
  -- (a) jerarquía invertida
  SELECT DISTINCT c.id
  FROM courses c JOIN course_holes h ON h.course_id = c.id
  WHERE
    (h.yardaje_negras IS NOT NULL AND h.yardaje_azul IS NOT NULL AND h.yardaje_negras + 2 < h.yardaje_azul)
    OR (h.yardaje_azul IS NOT NULL AND h.yardaje_blanco IS NOT NULL AND h.yardaje_azul + 2 < h.yardaje_blanco)
    OR (h.yardaje_blanco IS NOT NULL AND h.yardaje_rojo IS NOT NULL AND h.yardaje_blanco + 2 < h.yardaje_rojo)
  UNION
  -- (b) SI duplicado
  SELECT DISTINCT course_id FROM (
    SELECT course_id, stroke_index, COUNT(*) AS reps
    FROM course_holes
    WHERE stroke_index IS NOT NULL
    GROUP BY course_id, stroke_index
    HAVING COUNT(*) > 1
  ) x
  UNION
  -- (c) yardaje ≤ 0
  SELECT DISTINCT course_id FROM course_holes
  WHERE yardaje_blanco <= 0 OR yardaje_azul <= 0 OR yardaje_rojo <= 0 OR yardaje_negras <= 0
)
UPDATE course_holes
SET yardaje_negras = NULL,
    yardaje_azul = NULL,
    yardaje_blanco = NULL,
    yardaje_rojo = NULL,
    fuente_yardaje = NULL,
    yardaje_verificado_at = NULL
WHERE course_id IN (SELECT id FROM canchas_rotas);

-- ── 4. Reporte final ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(DISTINCT course_id) FROM course_holes WHERE yardaje_blanco IS NOT NULL OR yardaje_azul IS NOT NULL OR yardaje_rojo IS NOT NULL OR yardaje_negras IS NOT NULL) AS canchas_con_yardaje_post,
  (SELECT COUNT(*) FROM rondas_libres WHERE tees = 'negras') AS rondas_con_tee_negras,
  (SELECT COUNT(*) FROM rondas_libres WHERE tees IN ('campeonato','black','negro','blue','dorado','amarillo','white','red')) AS rondas_con_alias_legacy,
  (SELECT COUNT(*) FROM tournaments WHERE tees = 'negras') AS torneos_con_tee_negras,
  (SELECT COUNT(*) FROM ronda_libre_jugadores WHERE tees = 'negras') AS jugadores_con_tee_negras;
