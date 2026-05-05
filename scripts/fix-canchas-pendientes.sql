-- Fix canchas pendientes 2026-05-05
-- Sprint: limpieza de residuos del audit handicap
-- Bundles 3 fixes en un solo script transaccional.

BEGIN;

-- =====================================================
-- FIX 1: C.G. 7 Ríos padre (stub sin tees) → activa=false
-- =====================================================
-- Contexto: 3 canchas para el mismo club (FedeGolf id=51).
-- La "padre" no tiene tees ni rondas. Las DAMAS y VARONES son las productivas.
-- No se borra para no romper futuros sync FedeGolf que la recrearían.
UPDATE courses
SET activa = false,
    datos_verificados = false,
    updated_at = NOW()
WHERE id = '6a3ba422-d1ed-429c-914b-73583474344d'
  AND (SELECT COUNT(*) FROM course_tees WHERE course_id = '6a3ba422-d1ed-429c-914b-73583474344d') = 0;

-- =====================================================
-- FIX 2: SKIPPED — Tees no-canónicos requieren refactor estructural
-- =====================================================
-- Contexto: 5 tees no canónicos detectados.
--   - 2 Hurlingham ('amarillo - damas', 'rojo - caballeros'): el course mezcla
--     géneros M+F, viola el modelo de canchas (DAMAS y VARONES deben ser
--     courses distintos). UNIQUE (course_id, nombre) impide renombrar sin
--     primero hacer split del course. Fix correcto = sprint propio con
--     migración de rondas históricas.
--   - 3 Nordelta ('green', 'green - damas', 'gris'): nombres reales del club
--     argentino, no son residuos. Requiere decisión de producto sobre extender
--     el set canónico vs mapear arbitrariamente.
-- Por consistencia con la directiva CERO FALLOS y "soluciones permanentes,
-- nunca parches", se DOCUMENTA y se posterga; ver docs/DATA_FIXES_2026-05-05.md.

-- =====================================================
-- FIX 3: Olivos — rellenar back_* con front_* (convención WHS 9h)
-- =====================================================
-- Contexto: cancha tipo='9h' jugada como 18h = loop dos veces. WHS define
-- back rating = front rating en este caso. El fix sistémico previo dejó
-- back_*=NULL; lo completamos para coherencia y para que joins futuros no
-- fallen en NULL inesperados.
UPDATE course_tees
SET back_course_rating = front_course_rating,
    back_slope_rating  = front_slope_rating,
    back_bogey_rating  = front_bogey_rating
WHERE course_id = '98318206-7adc-4963-91bb-e1fc46a554f3'
  AND back_course_rating IS NULL
  AND front_course_rating IS NOT NULL;

COMMIT;

-- =====================================================
-- VERIFICACIÓN post-fix (un único bundle JSON)
-- =====================================================
SELECT jsonb_pretty(jsonb_build_object(
  '7rios_padre', (
    SELECT jsonb_build_object('id', id, 'activa', activa, 'datos_verificados', datos_verificados)
    FROM courses WHERE id = '6a3ba422-d1ed-429c-914b-73583474344d'
  ),
  'olivos_tees_back_completos', (
    SELECT jsonb_agg(jsonb_build_object(
      'nombre', nombre,
      'front_cr', front_course_rating, 'back_cr', back_course_rating,
      'front_sl', front_slope_rating,  'back_sl', back_slope_rating,
      'simetrico', (front_course_rating IS NOT DISTINCT FROM back_course_rating
                    AND front_slope_rating IS NOT DISTINCT FROM back_slope_rating)
    ) ORDER BY nombre)
    FROM course_tees WHERE course_id = '98318206-7adc-4963-91bb-e1fc46a554f3'
  ),
  'tees_no_canonicos_restantes', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', t.nombre, 'course', c.nombre) ORDER BY t.nombre), '[]'::jsonb)
    FROM course_tees t JOIN courses c ON c.id = t.course_id
    WHERE LOWER(t.nombre) NOT IN ('negras','azul','blanco','rojo','dorado')
      AND LOWER(t.nombre) !~ '^(negras|azul|blanco|rojo|dorado)_'
  )
)) AS verificacion;
