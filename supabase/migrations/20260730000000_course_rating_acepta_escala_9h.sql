-- Migración: la base deja de rechazar el Course Rating real de 9 hoyos
-- ============================================================================
--
-- ⚠️  ESCRITA, NO EJECUTADA. Se aplica junto con el Frente B (la carga de los
--     ratings oficiales de 9 hoyos). Antes de correrla no hay nada que ganar y
--     el guardarrail de código (A1–A4) ya protege el cálculo.
--
-- PROBLEMA
-- --------
-- La migración 033 puso `CHECK (rating BETWEEN 50 AND 85)` sobre
-- `course_tees.rating` y `courses.course_rating`. Ese rango es el de una vuelta
-- de 18 hoyos. El Course Rating real de una cancha de 9 hoyos vive cerca de su
-- par: ~35, no ~70. O sea: la base RECHAZA el dato correcto.
--
-- Consecuencia medida en producción (jul-2026): las 11 canchas de 9 hoyos del
-- catálogo tienen cargado el número de 18 hoyos, o uno imposible, porque es lo
-- único que la constraint dejaba entrar:
--   · C.G. Río Blanco (×2 recorridos)        → par 35, rating 55
--   · Brisas / Marbella / Rocas (9 loops)    → par 36, rating 72
-- Con esos datos la fórmula WHS suma +20 o +36 golpes de la nada. La constraint
-- que se puso para proteger los datos es la que fuerza el dato malo.
--
-- QUÉ HACE
-- --------
-- Ensancha el piso de 50 a 25 en las dos columnas de Course Rating de 18h, para
-- que un rating de 9 hoyos (25–45) pueda guardarse tal cual.
--
--   course_tees.rating       [50, 85]  →  [25, 85]
--   courses.course_rating    [50, 85]  →  [25, 85]
--
-- Lo que NO toca:
--   · Ninguna fila. Es sólo DDL de constraints — cero UPDATE, cero DELETE.
--   · `slope` / `slope_rating`: el slope NO cambia de escala entre 9 y 18
--     hoyos, [55,155] sigue siendo el rango WHS correcto.
--   · `front_course_rating` / `back_course_rating`: ya aceptan [25,45].
--   · `courses.par_total`: intacto.
--
-- El rango nuevo es ESTRICTAMENTE MÁS ANCHO que el viejo, así que ninguna fila
-- existente puede quedar en infracción. El pre-check de abajo lo verifica en
-- vivo antes de tocar nada y aborta si no se cumple.
--
-- POR QUÉ [25, 85] Y NO ALGO MÁS FINO
-- -----------------------------------
-- La constraint es una red gruesa: "esto se parece a un Course Rating". La red
-- fina — ¿este rating cuadra con ESTE par, a ESTA cantidad de hoyos? — no cabe
-- en un CHECK, porque el par vive en otra tabla (`courses`) y Postgres no deja
-- cruzarlas en una constraint. Esa pregunta ya tiene dueño en el código:
--   · `src/golf/courses/rating-coherente.ts` — el predicado.
--   · `src/golf/core/course-handicap.ts`     — el freno en el cálculo.
--   · `src/__tests__/integration/catalogo-rating-canary.test.ts` — el canario
--     que revisa el catálogo entero en cada PR.
-- Un rating de 47 (que no es ni de 9 ni de 18) pasaría este CHECK y lo frena el
-- canario. Preferimos eso a una constraint astuta que un día rebote la carga
-- legítima de un club a las 2 AM.
--
-- REVERSIBLE
-- ----------
-- El rollback está al final del archivo, listo para pegar. Sólo se puede
-- revertir mientras NO haya ratings de 9 hoyos cargados: si ya los hay, volver
-- al piso de 50 rebotaría datos buenos. El bloque de rollback lo verifica y
-- aborta solo si encuentra alguno.
--
-- Idempotente: re-ejecutarla no produce cambios.

BEGIN;

-- ── 1. Pre-check: nadie queda en infracción con el rango nuevo ─────────────
DO $$
DECLARE
  v_bad_tees INT;
  v_bad_courses INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_tees FROM course_tees
    WHERE rating IS NOT NULL AND (rating < 25 OR rating > 85);
  SELECT COUNT(*) INTO v_bad_courses FROM courses
    WHERE course_rating IS NOT NULL AND (course_rating < 25 OR course_rating > 85);

  RAISE NOTICE 'Pre-check: % tees y % courses fuera de [25,85] (esperado: 0 y 0)',
    v_bad_tees, v_bad_courses;

  IF v_bad_tees > 0 OR v_bad_courses > 0 THEN
    RAISE EXCEPTION
      'Hay % tees y % courses con course rating fuera de [25,85]. Esto no debería pasar: el rango viejo era [50,85]. Revisar el dato antes de ensanchar.',
      v_bad_tees, v_bad_courses;
  END IF;
END $$;

-- ── 2. course_tees.rating ∈ [25, 85] ──────────────────────────────────────
ALTER TABLE course_tees DROP CONSTRAINT IF EXISTS course_tees_rating_range_check;
ALTER TABLE course_tees
  ADD CONSTRAINT course_tees_rating_range_check
  CHECK (rating IS NULL OR (rating >= 25 AND rating <= 85));

COMMENT ON CONSTRAINT course_tees_rating_range_check ON course_tees IS
  'Course Rating: [25,85]. El piso baja de 50 a 25 para aceptar el rating real de una cancha de 9 hoyos (~35), que la migración 033 rechazaba. La coherencia rating↔par la valida src/golf/courses/rating-coherente.ts.';

-- ── 3. courses.course_rating ∈ [25, 85] ───────────────────────────────────
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_course_rating_range_check;
ALTER TABLE courses
  ADD CONSTRAINT courses_course_rating_range_check
  CHECK (course_rating IS NULL OR (course_rating >= 25 AND course_rating <= 85));

COMMENT ON CONSTRAINT courses_course_rating_range_check ON courses IS
  'Course Rating: [25,85]. Mismo motivo que course_tees_rating_range_check.';

COMMIT;

-- ── Sanity check post-aplicación ──────────────────────────────────────────
-- Espera dos filas, ambas con el rango nuevo visible en la definición.
SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conname IN ('course_tees_rating_range_check', 'courses_course_rating_range_check')
ORDER BY tabla;


-- ============================================================================
-- ROLLBACK — volver al rango [50, 85] de la migración 033
-- ============================================================================
-- Aborta si ya hay ratings de 9 hoyos cargados (revertir los rebotaría).
--
-- BEGIN;
--
-- DO $$
-- DECLARE
--   v_nueve_hoyos INT;
-- BEGIN
--   SELECT COUNT(*) INTO v_nueve_hoyos FROM (
--     SELECT rating AS r FROM course_tees WHERE rating IS NOT NULL AND rating < 50
--     UNION ALL
--     SELECT course_rating FROM courses WHERE course_rating IS NOT NULL AND course_rating < 50
--   ) x;
--   IF v_nueve_hoyos > 0 THEN
--     RAISE EXCEPTION
--       'Hay % ratings menores a 50 (ratings reales de 9 hoyos). Revertir los borraría del catálogo. Migrarlos a front_course_rating antes de revertir.',
--       v_nueve_hoyos;
--   END IF;
-- END $$;
--
-- ALTER TABLE course_tees DROP CONSTRAINT IF EXISTS course_tees_rating_range_check;
-- ALTER TABLE course_tees
--   ADD CONSTRAINT course_tees_rating_range_check
--   CHECK (rating IS NULL OR (rating >= 50 AND rating <= 85));
--
-- ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_course_rating_range_check;
-- ALTER TABLE courses
--   ADD CONSTRAINT courses_course_rating_range_check
--   CHECK (course_rating IS NULL OR (course_rating >= 50 AND course_rating <= 85));
--
-- COMMIT;
