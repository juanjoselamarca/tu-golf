-- Migration 033: hardening de rangos válidos en course_tees + courses
-- ----------------------------------------------------------------------
-- Motivación: el audit `scripts/audit-handicap-calc.mjs` (2026-05-05) encontró
-- 11 tees con CR/slope fuera de rangos sane y 1 tee con CR/slope swap (Marbella
-- DAMAS dorado: CR=107, slope=66). El cálculo `resolverCourseHandicap()` es
-- pura simple — el bug nunca está en la fórmula, está en los datos.
--
-- Esta migración agrega CHECK constraints SUAVES (rangos universales WHS) que
-- previenen escribir basura sin matar las par-3 courses legítimas.
--
-- Rangos elegidos:
--   slope:  55 ≤ slope ≤ 155     (oficial WHS — universal para cualquier par)
--   rating: 50 ≤ rating ≤ 85     (cubre par-3 courses CR≈55 hasta par-72 CR≈80)
--   par_total cancha: 27 ≤ par ≤ 78
--
-- NO se aplica NOT NULL todavía porque hay tees legacy con NULL que aún se
-- consumen vía fallback. La migración 034 (post-cleanup) hará NOT NULL.
--
-- Idempotente: re-ejecutar no produce cambios.

BEGIN;

-- ── 1. Detectar y reportar filas que VIOLAN los nuevos rangos ──────────────
-- Si hay >0 violaciones, RAISE NOTICE con detalle. La constraint sólo se
-- aplica al final si pasa. Si falla por residuos, abortar TX.

DO $$
DECLARE
  v_bad_slope INT;
  v_bad_rating INT;
  v_bad_par INT;
  v_offender RECORD;
BEGIN
  -- Conteos
  SELECT COUNT(*) INTO v_bad_slope FROM course_tees
    WHERE slope IS NOT NULL AND (slope < 55 OR slope > 155);
  SELECT COUNT(*) INTO v_bad_rating FROM course_tees
    WHERE rating IS NOT NULL AND (rating < 50 OR rating > 85);
  SELECT COUNT(*) INTO v_bad_par FROM courses
    WHERE par_total IS NOT NULL AND (par_total < 27 OR par_total > 78);

  RAISE NOTICE 'Pre-check: % tees con slope fuera de [55,155], % tees con rating fuera de [50,85], % courses con par fuera de [27,78]',
    v_bad_slope, v_bad_rating, v_bad_par;

  IF v_bad_slope > 0 OR v_bad_rating > 0 THEN
    RAISE NOTICE 'Filas ofensoras (top 20):';
    FOR v_offender IN
      SELECT t.id, c.nombre AS course, t.nombre AS tee, t.genero, t.rating, t.slope
      FROM course_tees t JOIN courses c ON c.id = t.course_id
      WHERE (t.slope IS NOT NULL AND (t.slope < 55 OR t.slope > 155))
         OR (t.rating IS NOT NULL AND (t.rating < 50 OR t.rating > 85))
      ORDER BY c.nombre, t.nombre
      LIMIT 20
    LOOP
      RAISE NOTICE '  → tee % | % - % (%) | rating=% slope=%',
        v_offender.id, v_offender.course, v_offender.tee, v_offender.genero,
        v_offender.rating, v_offender.slope;
    END LOOP;
    RAISE EXCEPTION 'Hay % tees con slope inválido y % con rating inválido. Limpiar antes de aplicar la constraint. (Ejecutar después: scripts/clean-handicap-data.mjs si existe, o fix manual.)',
      v_bad_slope, v_bad_rating;
  END IF;

  IF v_bad_par > 0 THEN
    RAISE EXCEPTION 'Hay % courses con par_total fuera de [27,78]. Limpiar antes.',
      v_bad_par;
  END IF;
END $$;

-- ── 2. course_tees.slope ∈ [55, 155] ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_tees'::regclass
      AND conname = 'course_tees_slope_range_check'
  ) THEN
    ALTER TABLE course_tees
      ADD CONSTRAINT course_tees_slope_range_check
      CHECK (slope IS NULL OR (slope >= 55 AND slope <= 155));
  END IF;
END $$;

-- ── 3. course_tees.rating ∈ [50, 85] ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_tees'::regclass
      AND conname = 'course_tees_rating_range_check'
  ) THEN
    ALTER TABLE course_tees
      ADD CONSTRAINT course_tees_rating_range_check
      CHECK (rating IS NULL OR (rating >= 50 AND rating <= 85));
  END IF;
END $$;

-- ── 4. course_tees.front_slope_rating + back_slope_rating ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_tees'::regclass
      AND conname = 'course_tees_front_slope_range_check'
  ) THEN
    ALTER TABLE course_tees
      ADD CONSTRAINT course_tees_front_slope_range_check
      CHECK (front_slope_rating IS NULL OR (front_slope_rating >= 55 AND front_slope_rating <= 155));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_tees'::regclass
      AND conname = 'course_tees_back_slope_range_check'
  ) THEN
    ALTER TABLE course_tees
      ADD CONSTRAINT course_tees_back_slope_range_check
      CHECK (back_slope_rating IS NULL OR (back_slope_rating >= 55 AND back_slope_rating <= 155));
  END IF;
END $$;

-- ── 5. course_tees front/back course_rating ∈ [25, 45] (sólo 9h) ──────────
-- Front 9 y back 9 tienen CR aproximadamente la mitad del total (≈ 32-40 para
-- par 70-72). Rango sane [25, 45] cubre par 27-72.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_tees'::regclass
      AND conname = 'course_tees_front_cr_range_check'
  ) THEN
    ALTER TABLE course_tees
      ADD CONSTRAINT course_tees_front_cr_range_check
      CHECK (front_course_rating IS NULL OR (front_course_rating >= 25 AND front_course_rating <= 45));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'course_tees'::regclass
      AND conname = 'course_tees_back_cr_range_check'
  ) THEN
    ALTER TABLE course_tees
      ADD CONSTRAINT course_tees_back_cr_range_check
      CHECK (back_course_rating IS NULL OR (back_course_rating >= 25 AND back_course_rating <= 45));
  END IF;
END $$;

-- ── 6. courses.par_total ∈ [27, 78] ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'courses'::regclass
      AND conname = 'courses_par_total_range_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_par_total_range_check
      CHECK (par_total IS NULL OR (par_total >= 27 AND par_total <= 78));
  END IF;
END $$;

-- ── 7. courses.slope_rating ∈ [55, 155] y course_rating ∈ [50, 85] ────────
-- Estos son los placeholders FedeGolf. Permitimos NULL pero si están poblados
-- deben respetar rango.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'courses'::regclass
      AND conname = 'courses_slope_range_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_slope_range_check
      CHECK (slope_rating IS NULL OR (slope_rating >= 55 AND slope_rating <= 155));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'courses'::regclass
      AND conname = 'courses_course_rating_range_check'
  ) THEN
    ALTER TABLE courses
      ADD CONSTRAINT courses_course_rating_range_check
      CHECK (course_rating IS NULL OR (course_rating >= 50 AND course_rating <= 85));
  END IF;
END $$;

-- ── 8. Documentación ─────────────────────────────────────────────────────
COMMENT ON CONSTRAINT course_tees_slope_range_check ON course_tees IS
  'Rango WHS oficial de slope: 55-155. Migration 033.';
COMMENT ON CONSTRAINT course_tees_rating_range_check ON course_tees IS
  'Rango sane de course rating: 50-85 (cubre par-3 courses hasta par-72). Migration 033.';

COMMIT;

-- ── Sanity check post-aplicación ──────────────────────────────────────────
SELECT
  'OK' AS status,
  COUNT(*) FILTER (WHERE conname LIKE 'course_tees_%_check') AS tees_constraints,
  COUNT(*) FILTER (WHERE conname LIKE 'courses_%_check') AS courses_constraints
FROM pg_constraint
WHERE conrelid IN ('course_tees'::regclass, 'courses'::regclass)
  AND conname LIKE '%_range_check';
